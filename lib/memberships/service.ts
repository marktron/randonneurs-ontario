/**
 * Membership Service
 *
 * Handles membership verification for event registration.
 * Checks local database first, then queries CCN API if needed.
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
 * Get membership for a rider, checking database first then CCN API.
 *
 * @param riderId - Rider's UUID
 * @param firstName - Rider's first name (for CCN lookup)
 * @param lastName - Rider's last name (for CCN lookup)
 * @returns Membership data if found, or { found: false }
 */
export async function getMembershipForRider(
  riderId: string,
  firstName: string,
  lastName: string
): Promise<MembershipResult> {
  const supabase = getSupabaseAdmin()
  const currentSeason = getCurrentSeason()

  // Check database first
  const { data: existingMembership } = await supabase
    .from('memberships')
    .select('membership_id, type')
    .eq('rider_id', riderId)
    .eq('season', currentSeason)
    .single()

  if (existingMembership) {
    return {
      found: true,
      membershipId: existingMembership.membership_id,
      type: existingMembership.type as MembershipType,
    }
  }

  // Query CCN API
  const ccnResult = await searchCCNMembership(firstName, lastName)

  if (!ccnResult.found) {
    return { found: false }
  }

  // Cache in database
  await supabase.from('memberships').insert({
    rider_id: riderId,
    season: currentSeason,
    membership_id: ccnResult.membershipId,
    type: ccnResult.type,
  })

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
