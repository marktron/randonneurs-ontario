/**
 * CCN (Cycling Canada Network) API Client
 *
 * Queries the CCN membership API to verify rider membership status.
 * @see docs/registration-check.md for API documentation
 */

import { fuzzyNameScore } from '@/lib/utils/fuzzy-match'

export type CCNMembershipType =
  | 'Individual Membership'
  | 'Additional Family Member'
  | 'Family Membership > PRIMARY FAMILY MEMBER'
  | 'Trial Member'

export type CCNSearchResult =
  | {
      found: true
      membershipId: number
      type: CCNMembershipType
      city: string
      country: string
    }
  | {
      found: false
    }

interface CCNAPIResultRow {
  id: number
  full_name: string
  registration_category: string
  city: string
  country: string
}

interface CCNAPIResponse {
  count: number
  results: CCNAPIResultRow[]
}

// CCN's API doesn't expose email, so when CCN's recorded name diverges from
// what the rider entered on RO (e.g. Ludo vs Ludovic), the exact-name lookup
// returns nothing. After such a miss we retry with surname-only and accept a
// fuzzy match if exactly one candidate stands out.
const FUZZY_ACCEPT_THRESHOLD = 0.85
const FUZZY_AMBIGUITY_GAP = 0.15

/**
 * Search CCN API for a member by name.
 *
 * First tries the exact "firstName lastName" search. If that returns nothing
 * and a last name is provided, falls back to a surname-only search and ranks
 * the candidates by fuzzy first-name match (which already understands
 * nicknames, prefix-form short names, and surname prefixes).
 *
 * @param firstName - Rider's first name
 * @param lastName - Rider's last name
 * @returns Membership data if found, or { found: false }
 * @throws Error if API request fails
 */
export async function searchCCNMembership(
  firstName: string,
  lastName: string
): Promise<CCNSearchResult> {
  const endpoint = process.env.CCN_ENDPOINT
  if (!endpoint) {
    throw new Error('CCN_ENDPOINT environment variable not set')
  }

  const fullName = `${firstName} ${lastName}`.trim()
  const exact = await fetchCCN(endpoint, fullName)
  if (exact.length > 0) {
    return pickByTrialPreference(exact, fullName)
  }

  const trimmedLast = lastName.trim()
  if (!trimmedLast) {
    return { found: false }
  }

  const candidates = await fetchCCN(endpoint, trimmedLast)
  if (candidates.length === 0) {
    return { found: false }
  }

  return rankSurnameCandidates(candidates, firstName, trimmedLast)
}

async function fetchCCN(endpoint: string, search: string): Promise<CCNAPIResultRow[]> {
  const url = `${endpoint}&search=${encodeURIComponent(search)}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('CCN API timed out after 10s')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`CCN API error: ${response.status}`)
  }

  const data: CCNAPIResponse = await response.json()
  return data.results ?? []
}

/**
 * Pick a single row from a set the API matched by exact name. CCN can return
 * multiple rows for the same rider — e.g. Trial + later Individual upgrade —
 * so prefer any non-Trial match.
 */
function pickByTrialPreference(rows: CCNAPIResultRow[], label: string): CCNSearchResult {
  const member = rows.find((r) => r.registration_category !== 'Trial Member') ?? rows[0]

  if (rows.length > 1) {
    console.warn(
      `CCN returned ${rows.length} results for "${label}" — using match ID ${member.id} (${member.registration_category})`
    )
  }

  return rowToResult(member)
}

function rankSurnameCandidates(
  rows: CCNAPIResultRow[],
  firstName: string,
  lastName: string
): CCNSearchResult {
  const scored = rows
    .map((row) => {
      const { first, last } = splitFullName(row.full_name)
      return { row, score: fuzzyNameScore(firstName, lastName, first, last) }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  if (!top || top.score < FUZZY_ACCEPT_THRESHOLD) {
    return { found: false }
  }

  // Treat candidates that score within the acceptance band of the leader as
  // belonging to the leader's "tie group". If all of them are the same person
  // (same normalized name), apply Trial-preference dedup. Otherwise the match
  // is ambiguous (e.g. mother/daughter) — refuse to guess.
  const tieGroup = scored.filter((s) => top.score - s.score < FUZZY_AMBIGUITY_GAP)
  const distinctNames = new Set(tieGroup.map((s) => s.row.full_name.toLowerCase().trim()))

  if (distinctNames.size > 1) {
    console.warn(
      `CCN surname-fallback for "${firstName} ${lastName}" matched ${distinctNames.size} distinct people above the ambiguity threshold — refusing to auto-link`
    )
    return { found: false }
  }

  return pickByTrialPreference(
    tieGroup.map((s) => s.row),
    `${firstName} ${lastName} (surname fallback)`
  )
}

function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function rowToResult(row: CCNAPIResultRow): CCNSearchResult {
  return {
    found: true,
    membershipId: row.id,
    type: row.registration_category as CCNMembershipType,
    city: row.city,
    country: row.country,
  }
}
