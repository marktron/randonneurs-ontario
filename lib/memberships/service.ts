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

export type MembershipResult =
  | {
      found: true
      membershipId: number
      type: MembershipType
    }
  | {
      found: false
    }

export interface MembershipLookup {
  riderId: string
  firstName: string
  lastName: string
  /** Season to verify membership for (the event's season) */
  season: number
  /** Optional chapter ID from the event (only real chapters) */
  chapterId?: string
}

/**
 * Get membership for a rider, checking rider_memberships first then CCN API.
 *
 * If the rider has a non-Trial membership cached, returns immediately.
 * If the rider has a Trial membership, re-checks CCN to detect upgrades.
 * If no cached membership, queries CCN and caches the result.
 *
 * @param params - Rider identity, the season to verify, and optional chapter
 * @returns Membership data if found, or { found: false }
 */
export async function getMembershipForRider(params: MembershipLookup): Promise<MembershipResult> {
  const { riderId, firstName, lastName, season, chapterId } = params
  const supabase = getSupabaseAdmin()

  // Check rider_memberships first
  const { data: existingMembership } = await supabase
    .from('rider_memberships')
    .select('ccn_id, membership_type, chapter_id')
    .eq('rider_id', riderId)
    .eq('season', season)
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
  const ccnResult = await searchCCNMembership(firstName, lastName, season)

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
    season,
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
 * 1. Any result with status finished/dnf/otl/dq in the given season
 * 2. Any registration for an event in the given season with event_date >= today
 *
 * @param riderId - Rider's UUID
 * @param season - Season to check (the event's season)
 * @returns true if trial is used, false if still available
 */
export async function isTrialUsed(riderId: string, season: number): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  // Check for counting results (finished, dnf, otl, dq - not dns)
  const { data: results } = await supabase
    .from('results')
    .select('id')
    .eq('rider_id', riderId)
    .eq('season', season)
    .in('status', ['finished', 'dnf', 'otl', 'dq'])
    .limit(1)

  if (results && results.length > 0) {
    return true
  }

  // Check for upcoming registrations (excluding current registration being made)
  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, events!inner(event_date, season)')
    .eq('rider_id', riderId)
    .eq('status', 'registered')
    .gte('events.event_date', today)
    .eq('events.season', season)
    .limit(1)

  return registrations !== null && registrations.length > 0
}
