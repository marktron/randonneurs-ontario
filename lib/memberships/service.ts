/**
 * Membership Service
 *
 * Handles membership verification for event registration.
 * Checks rider_memberships table first, then queries CCN API if needed.
 * Writes verified memberships to rider_memberships for caching and tracking.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { searchCCNMembership } from '@/lib/ccn/client'
import type { MembershipType } from '@/types/queries'

const getCurrentSeason = () => parseInt(process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026', 10)

export type MembershipResult =
  | {
      found: true
      membershipId: number
      type: MembershipType
    }
  | {
      found: false
    }

/**
 * Get membership for a rider, checking rider_memberships first then CCN API.
 *
 * If the rider has a non-Trial membership cached, returns immediately.
 * If the rider has a Trial membership, re-checks CCN to detect upgrades.
 * If no cached membership, queries CCN and caches the result.
 *
 * @param riderId - Rider's UUID
 * @param firstName - Rider's first name (for CCN lookup)
 * @param lastName - Rider's last name (for CCN lookup)
 * @param chapterId - Optional chapter ID from the event (only real chapters)
 * @returns Membership data if found, or { found: false }
 */
export async function getMembershipForRider(
  riderId: string,
  firstName: string,
  lastName: string,
  chapterId?: string
): Promise<MembershipResult> {
  const supabase = getSupabaseAdmin()
  const currentSeason = getCurrentSeason()

  // Check rider_memberships first
  const { data: existingMembership } = await supabase
    .from('rider_memberships')
    .select('ccn_id, membership_type, chapter_id')
    .eq('rider_id', riderId)
    .eq('season', currentSeason)
    .single()

  // If found and NOT Trial, return immediately (skip API call)
  if (existingMembership && existingMembership.membership_type !== 'Trial Member') {
    return {
      found: true,
      membershipId: existingMembership.ccn_id ?? 0,
      type: existingMembership.membership_type as MembershipType,
    }
  }

  // Either no row exists, or it's a Trial Member — check CCN API
  const ccnResult = await searchCCNMembership(firstName, lastName)

  if (!ccnResult.found) {
    // If we had an existing Trial row, preserve it (graceful degradation)
    if (existingMembership) {
      return {
        found: true,
        membershipId: existingMembership.ccn_id ?? 0,
        type: existingMembership.membership_type as MembershipType,
      }
    }
    return { found: false }
  }

  // Build upsert payload — only include chapter_id if we should set it
  const shouldSetChapter = chapterId && (!existingMembership || !existingMembership.chapter_id)
  const upsertData = {
    rider_id: riderId,
    season: currentSeason,
    ccn_id: ccnResult.membershipId,
    membership_type: ccnResult.type,
    city: ccnResult.city || null,
    country: ccnResult.country || null,
    ...(shouldSetChapter ? { chapter_id: chapterId } : {}),
  }

  const { error } = await supabase
    .from('rider_memberships')
    .upsert(upsertData, { onConflict: 'rider_id,season' })

  if (error) {
    console.error(`Failed to cache membership for rider ${riderId}:`, error.message)
  }

  return {
    found: true,
    membershipId: ccnResult.membershipId,
    type: ccnResult.type,
  }
}

/**
 * Check if a Trial Member has already used their trial event.
 *
 * Trial is "used" if:
 * 1. Any result with status finished/dnf/otl/dq in current season
 * 2. Any registration for event_date >= today
 *
 * @param riderId - Rider's UUID
 * @returns true if trial is used, false if still available
 */
export async function isTrialUsed(riderId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const currentSeason = getCurrentSeason()
  const today = new Date().toISOString().split('T')[0]

  // Check for counting results (finished, dnf, otl, dq - not dns)
  const { data: results } = await supabase
    .from('results')
    .select('id')
    .eq('rider_id', riderId)
    .eq('season', currentSeason)
    .in('status', ['finished', 'dnf', 'otl', 'dq'])
    .limit(1)

  if (results && results.length > 0) {
    return true
  }

  // Check for upcoming registrations (excluding current registration being made)
  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, events!inner(event_date)')
    .eq('rider_id', riderId)
    .eq('status', 'registered')
    .gte('events.event_date', today)
    .limit(1)

  return registrations !== null && registrations.length > 0
}
