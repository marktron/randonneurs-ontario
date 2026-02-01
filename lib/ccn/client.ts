/**
 * CCN (Cycling Canada Network) API Client
 *
 * Queries the CCN membership API to verify rider membership status.
 * @see docs/registration-check.md for API documentation
 */

export type CCNSearchResult =
  | {
      found: true
      membershipId: number
      type:
        | 'Individual Membership'
        | 'Additional Family Member'
        | 'Family Membership > PRIMARY FAMILY MEMBER'
        | 'Trial Member'
    }
  | {
      found: false
    }

interface CCNAPIResponse {
  count: number
  results: Array<{
    id: number
    full_name: string
    registration_category: string
  }>
}

/**
 * Search CCN API for a member by name.
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

  const fullName = `${firstName} ${lastName}`
  const url = `${endpoint}&search=${encodeURIComponent(fullName)}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CCN API error: ${response.status}`)
  }

  const data: CCNAPIResponse = await response.json()

  if (data.count === 0 || data.results.length === 0) {
    return { found: false }
  }

  // Take the first result (future: handle multiple matches)
  const member = data.results[0]
  return {
    found: true,
    membershipId: member.id,
    type: member.registration_category as CCNSearchResult & { found: true }['type'],
  }
}
