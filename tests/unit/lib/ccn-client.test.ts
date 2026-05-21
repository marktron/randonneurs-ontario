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
    // Full-name miss → surname-fallback also empty → not found.
    mockFetch.mockResolvedValue({
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

  describe('surname fallback (name mismatch between RO registration and CCN)', () => {
    // CCN's API doesn't expose email, so when the names diverge between what a
    // rider entered on RO and what's on file at CCN (e.g. Ludovic vs Ludo),
    // the full-name search returns nothing. Fall back to a surname-only search
    // and fuzzy-match the candidates by first name.

    it('finds Ludo Magne when registrant entered "Ludovic Magne"', async () => {
      // Full-name search returns nothing.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })
      // Surname-only search returns the actual member under a different first name.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 11753016,
              full_name: 'Ludo Magne',
              registration_category: 'Trial Member',
              city: 'Toronto',
              country: 'Canada',
            },
          ],
        }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Ludovic', 'Magne')

      expect(result).toEqual({
        found: true,
        membershipId: 11753016,
        type: 'Trial Member',
        city: 'Toronto',
        country: 'Canada',
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('search=Magne'),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('does not fall back when full-name search returns results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 1,
              full_name: 'Mark Allen',
              registration_category: 'Individual Membership',
              city: 'Toronto',
              country: 'Canada',
            },
          ],
        }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      await searchCCNMembership('Mark', 'Allen')

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns not found when surname fallback yields no fuzzy match above threshold', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })
      // Surname returns an unrelated person — fuzzy score on first name too low.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          results: [
            {
              id: 999,
              full_name: 'Beatrice Magne',
              registration_category: 'Individual Membership',
              city: 'Toronto',
              country: 'Canada',
            },
          ],
        }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Ludovic', 'Magne')

      expect(result).toEqual({ found: false })
    })

    it('returns not found when the surname search itself returns nothing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Ludovic', 'Magne')

      expect(result).toEqual({ found: false })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns not found when surname has multiple strong matches (ambiguity guard)', async () => {
      // Two family members with the same surname both fuzzy-match the
      // registrant's first name almost identically — refuse to guess between
      // mother/daughter "Ann Wong" vs "Anne Wong" when registering "Anna Wong".
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 2,
          results: [
            {
              id: 1,
              full_name: 'Ann Wong',
              registration_category: 'Individual Membership',
              city: 'Toronto',
              country: 'Canada',
            },
            {
              id: 2,
              full_name: 'Anne Wong',
              registration_category: 'Individual Membership',
              city: 'Toronto',
              country: 'Canada',
            },
          ],
        }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Anna', 'Wong')

      expect(result).toEqual({ found: false })
    })

    it('picks the non-Trial row when surname fuzzy match returns same person twice', async () => {
      // CCN sometimes has Trial + upgrade rows for the same person under one
      // name — Trial-preference dedup should still apply after fuzzy ranking.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 2,
          results: [
            {
              id: 1,
              full_name: 'Ludo Magne',
              registration_category: 'Trial Member',
              city: 'Toronto',
              country: 'Canada',
            },
            {
              id: 2,
              full_name: 'Ludo Magne',
              registration_category: 'Individual Membership',
              city: 'Toronto',
              country: 'Canada',
            },
          ],
        }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Ludovic', 'Magne')

      expect(result).toMatchObject({
        found: true,
        membershipId: 2,
        type: 'Individual Membership',
      })
    })

    it('skips the surname fallback when no last name is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, results: [] }),
      })

      const { searchCCNMembership } = await import('@/lib/ccn/client')
      const result = await searchCCNMembership('Ludovic', '')

      expect(result).toEqual({ found: false })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
