import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('searchCCNMembership', () => {
  const originalFetch = global.fetch
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = mockFetch
    process.env.CCN_ENDPOINT =
      'https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392'
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.CCN_ENDPOINT
  })

  it('returns membership data when member found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            id: 11669640,
            full_name: 'Mark Allen',
            registration_category: 'Individual Membership',
            city: 'Toronto',
            country: 'Canada',
          },
        ],
      }),
    })

    // Dynamic import to get fresh module with mocked fetch
    const { searchCCNMembership } = await import('@/lib/ccn/client')
    const result = await searchCCNMembership('Mark', 'Allen')

    expect(result).toEqual({
      found: true,
      membershipId: 11669640,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('prefers non-Trial when CCN returns both Trial and a real membership', async () => {
    // Rider registered as Trial early in the season, then upgraded to
    // Individual. CCN returns both rows; we must pick the upgrade.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 2,
        results: [
          {
            id: 1001,
            full_name: 'Rider Upgrade',
            registration_category: 'Trial Member',
            city: 'Toronto',
            country: 'Canada',
          },
          {
            id: 1002,
            full_name: 'Rider Upgrade',
            registration_category: 'Individual Membership',
            city: 'Toronto',
            country: 'Canada',
          },
        ],
      }),
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    const result = await searchCCNMembership('Rider', 'Upgrade')

    expect(result).toEqual({
      found: true,
      membershipId: 1002,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })
  })

  it('falls back to first result when all matches are Trial', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 2,
        results: [
          {
            id: 1,
            full_name: 'Trial One',
            registration_category: 'Trial Member',
            city: 'Toronto',
            country: 'Canada',
          },
          {
            id: 2,
            full_name: 'Trial One',
            registration_category: 'Trial Member',
            city: 'Toronto',
            country: 'Canada',
          },
        ],
      }),
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    const result = await searchCCNMembership('Trial', 'One')

    expect(result).toMatchObject({ found: true, membershipId: 1, type: 'Trial Member' })
  })

  it('returns not found when no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 0, results: [] }),
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    const result = await searchCCNMembership('Nobody', 'Here')

    expect(result).toEqual({ found: false })
  })

  it('throws error when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    await expect(searchCCNMembership('Test', 'User')).rejects.toThrow('CCN API error: 500')
  })

  it('throws error when CCN_ENDPOINT not set', async () => {
    delete process.env.CCN_ENDPOINT

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    await expect(searchCCNMembership('Test', 'User')).rejects.toThrow(
      'CCN_ENDPOINT environment variable not set'
    )
  })
})
