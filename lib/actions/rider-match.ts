/**
 * Rider Matching Server Actions
 *
 * These actions support fuzzy matching of registrants to existing riders.
 * Used during registration to help returning riders link to their existing profile.
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
  obfuscatedEmail: string | null
}

interface RiderRow {
  id: string
  first_name: string
  last_name: string
  full_name: string | null
  email: string | null
  member_since: number | null
  results: Array<{ count: number }> | null
}

/**
 * Obfuscate an email for display in the rider match picker.
 * Shows first and last character of local part + domain.
 * e.g. "markallen@gmail.com" -> "m*******n@gmail.com"
 *      "jo@example.com" -> "j*@example.com"
 */
function obfuscateEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '•••'
  if (local.length <= 2) {
    return `${local[0]}•@${domain}`
  }
  return `${local[0]}${'•'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`
}

/**
 * Search for potential rider matches based on name.
 * Searches all riders (with or without email) to find returning members.
 *
 * @param firstName - First name from registration form
 * @param lastName - Last name from registration form
 * @param registrationEmail - Email from registration form (to exclude exact email matches,
 *                            which are handled separately by the email-first lookup)
 * @returns List of potential matches with ride statistics
 */
export async function searchRiderCandidates(
  firstName: string,
  lastName: string,
  registrationEmail?: string
): Promise<{ candidates: RiderMatchCandidate[] }> {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()

  if (!trimmedFirst && !trimmedLast) {
    return { candidates: [] }
  }

  // Get all nickname variants for the first name
  // e.g., "Bob" -> ["bob", "robert", "bobby", "rob", "robbie", "bert"]
  // getNameVariants strips PostgREST operator characters; if every char in
  // the input was stripped, there's nothing to search for.
  const firstNameVariants = getNameVariants(trimmedFirst)
  if (firstNameVariants.length === 0) {
    return { candidates: [] }
  }

  // Build OR filter for all name variants
  const orFilters = firstNameVariants.map((variant) => `first_name.ilike.%${variant}%`).join(',')

  // Query riders with their result counts
  const { data: riders, error } = await getSupabaseAdmin()
    .from('riders')
    .select(
      `
      id,
      first_name,
      last_name,
      full_name,
      email,
      member_since,
      results(count)
`
    )
    .or(orFilters)
    .limit(100)

  if (error) {
    logError(error, { operation: 'searchRiderCandidates' })
    return { candidates: [] }
  }

  if (!riders || riders.length === 0) {
    return { candidates: [] }
  }

  // Exclude riders whose email exactly matches the registration email,
  // since those are already handled by the email-first lookup path
  const normalizedRegEmail = registrationEmail?.toLowerCase().trim()
  const filteredRiders = normalizedRegEmail
    ? (riders as RiderRow[]).filter((r) => r.email?.toLowerCase() !== normalizedRegEmail)
    : (riders as RiderRow[])

  // Apply fuzzy matching to rank candidates
  const matches = findFuzzyNameMatches(
    trimmedFirst,
    trimmedLast,
    filteredRiders,
    (r) => r.first_name,
    (r) => r.last_name,
    { threshold: 0.4, maxResults: 10 }
  )

  // Convert to output format
  const candidates: RiderMatchCandidate[] = matches.map((match) => ({
    id: match.item.id,
    firstName: match.item.first_name,
    lastName: match.item.last_name,
    fullName: match.item.full_name || `${match.item.first_name} ${match.item.last_name}`,
    firstSeason: match.item.member_since,
    totalRides: match.item.results?.[0]?.count ?? 0,
    obfuscatedEmail: match.item.email ? obfuscateEmail(match.item.email) : null,
  }))

  return { candidates }
}
