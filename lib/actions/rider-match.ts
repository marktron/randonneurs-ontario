/**
 * Rider Matching Server Actions
 *
 * These actions support fuzzy matching of registrants to existing riders.
 * Used during registration to help returning riders (whose historical
 * records don't have email addresses) link to their existing profile.
 *
 * These are PUBLIC actions - no authentication required since they're
 * called during the registration flow.
 */
'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { findFuzzyNameMatches, getNameVariants } from '@/lib/utils/fuzzy-match'
import { logError } from '@/lib/errors'

export interface RiderMatchCandidate {
  id: string
  firstName: string
  lastName: string
  fullName: string
  firstSeason: number | null
  totalRides: number
}

interface RiderWithStats {
  id: string
  first_name: string
  last_name: string
  full_name: string | null
  first_season: number | null
  total_rides: number
}

interface RiderWithResults {
  id: string
  first_name: string
  last_name: string
  full_name: string | null
  results: Array<{ rider_id: string; season: number | null }> | null
}

/**
 * Search for potential rider matches based on name.
 * Only searches riders WITHOUT email (historical records).
 *
 * @param firstName - First name from registration form
 * @param lastName - Last name from registration form
 * @returns List of potential matches with ride statistics
 */
export async function searchRiderCandidates(
  firstName: string,
  lastName: string
): Promise<{ candidates: RiderMatchCandidate[] }> {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()

  if (!trimmedFirst && !trimmedLast) {
    return { candidates: [] }
  }

  // Get all nickname variants for the first name
  // e.g., "Bob" -> ["bob", "robert", "bobby", "rob", "robbie", "bert"]
  const firstNameVariants = getNameVariants(trimmedFirst)

  // Build OR filter for all name variants
  // This handles cases like Bob vs Robert, Dave vs David
  const orFilters = firstNameVariants
    .map(variant => `first_name.ilike.%${variant}%`)
    .join(',')

  // Query riders without email, with their results joined in a single query
  // This reduces round trips by fetching rider data and results together
  const { data: riders, error } = await getSupabaseAdmin()
    .from('riders')
    .select(`
      id,
      first_name,
      last_name,
      full_name,
      results (rider_id, season)
    `)
    .is('email', null)
    .or(orFilters)
    .limit(100)

  if (error) {
    logError(error, { operation: 'searchRiderCandidates' })
    return { candidates: [] }
  }

  if (!riders || riders.length === 0) {
    return { candidates: [] }
  }

  // Calculate stats per rider from joined results
  const riderStats: Record<string, { firstSeason: number | null; totalRides: number }> = {}
  for (const rider of riders) {
    riderStats[rider.id] = { firstSeason: null, totalRides: 0 }
    
    // Aggregate stats from joined results
    if (rider.results && Array.isArray(rider.results)) {
      for (const result of rider.results) {
        riderStats[rider.id].totalRides++
        if (result.season !== null) {
          const currentFirst = riderStats[rider.id].firstSeason
          if (currentFirst === null || result.season < currentFirst) {
            riderStats[rider.id].firstSeason = result.season
          }
        }
      }
    }
  }

  // Combine rider info with stats
  const ridersWithStats: RiderWithStats[] = (riders as RiderWithResults[]).map(r => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    full_name: r.full_name,
    first_season: riderStats[r.id].firstSeason,
    total_rides: riderStats[r.id].totalRides,
  }))

  // Apply fuzzy matching to rank candidates
  const matches = findFuzzyNameMatches(
    trimmedFirst,
    trimmedLast,
    ridersWithStats,
    r => r.first_name,
    r => r.last_name,
    { threshold: 0.4, maxResults: 10 }
  )

  // Convert to output format
  const candidates: RiderMatchCandidate[] = matches.map(match => ({
    id: match.item.id,
    firstName: match.item.first_name,
    lastName: match.item.last_name,
    fullName: match.item.full_name || `${match.item.first_name} ${match.item.last_name}`,
    firstSeason: match.item.first_season,
    totalRides: match.item.total_rides,
  }))

  return { candidates }
}
