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
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen'
    )
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
