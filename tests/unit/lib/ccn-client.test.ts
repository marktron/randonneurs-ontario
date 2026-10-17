import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('searchCCNMembership', () => {
  const originalFetch = global.fetch
  const mockFetch = vi.fn()

  beforeEach(async () => {
    vi.resetAllMocks()
    global.fetch = mockFetch
    process.env.CCN_MEMBERSHIP_EVENT_IDS = '2026:21392'
    // Prime the listing cache so each test's queued fetches are search calls only.
    const { __resetMembershipSeasonCache, getMembershipSeasonStatus } =
      await import('@/lib/ccn/client')
    __resetMembershipSeasonCache()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
    await getMembershipSeasonStatus(2026)
    mockFetch.mockClear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
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
    const result = await searchCCNMembership('Mark', 'Allen', 2026)

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
    const result = await searchCCNMembership('Rider', 'Upgrade', 2026)

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
    const result = await searchCCNMembership('Trial', 'One', 2026)

    expect(result).toMatchObject({ found: true, membershipId: 1, type: 'Trial Member' })
  })

  it('returns not found when no results', async () => {
    // Full-name miss → surname-fallback also empty → not found.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, results: [] }),
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    const result = await searchCCNMembership('Nobody', 'Here', 2026)

    expect(result).toEqual({ found: false })
  })

  it('throws error when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { searchCCNMembership } = await import('@/lib/ccn/client')
    await expect(searchCCNMembership('Test', 'User', 2026)).rejects.toThrow('CCN API error: 500')
  })

  it('returns not found when the season has no membership event', async () => {
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
    const { searchCCNMembership, __resetMembershipSeasonCache } = await import('@/lib/ccn/client')
    __resetMembershipSeasonCache()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })

    const result = await searchCCNMembership('Test', 'User', 2031)

    expect(result).toEqual({ found: false })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/listing_app/club-listings/'),
      expect.anything()
    )
  })

  it('logs and returns not found when the listing has no event for the season', async () => {
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { searchCCNMembership, __resetMembershipSeasonCache } = await import('@/lib/ccn/client')
    __resetMembershipSeasonCache()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })

    expect(await searchCCNMembership('Test', 'User', 2031)).toEqual({ found: false })
    expect(info).toHaveBeenCalledWith('CCN has no membership event for season 2031')
    info.mockRestore()
  })

  it('throws when the listing is unavailable and the season is unseeded', async () => {
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { searchCCNMembership, __resetMembershipSeasonCache } = await import('@/lib/ccn/client')
    __resetMembershipSeasonCache()
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(searchCCNMembership('Test', 'User', 2026)).rejects.toThrow(
      'CCN membership listing unavailable'
    )
    // Only the listing call: no search was attempted.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    warn.mockRestore()
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
      const result = await searchCCNMembership('Ludovic', 'Magne', 2026)

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
      await searchCCNMembership('Mark', 'Allen', 2026)

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
      const result = await searchCCNMembership('Ludovic', 'Magne', 2026)

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
      const result = await searchCCNMembership('Ludovic', 'Magne', 2026)

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
      const result = await searchCCNMembership('Anna', 'Wong', 2026)

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
      const result = await searchCCNMembership('Ludovic', 'Magne', 2026)

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
      const result = await searchCCNMembership('Ludovic', '', 2026)

      expect(result).toEqual({ found: false })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})

describe('getMembershipSeasonStatus', () => {
  const originalFetch = global.fetch
  const mockFetch = vi.fn()

  const listing = (overrides: Record<string, unknown> = {}) => ({
    name: 'Randonneurs Ontario Membership 2026',
    event: {
      id: 21392,
      status: 'AC',
      registration_opens: '2025-12-07T00:00:00',
      organization: { id: 1654 },
    },
    ...overrides,
  })
  const respond = (results: unknown[]) =>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: results.length, results }),
    })

  async function load() {
    const mod = await import('@/lib/ccn/client')
    mod.__resetMembershipSeasonCache()
    return mod
  }

  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = mockFetch
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.CCN_MEMBERSHIP_EVENT_IDS
    vi.restoreAllMocks()
  })

  it('open when the listing is active and registration has opened', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([listing()])
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
  })

  it('closed when registration_opens is in the future', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([
      listing({
        event: {
          id: 21392,
          status: 'AC',
          registration_opens: '2099-01-01T00:00:00',
          organization: { id: 1654 },
        },
      }),
    ])
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'closed', eventId: 21392 })
  })

  it('closed when the event status is not AC', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([
      listing({
        event: {
          id: 21392,
          status: 'CL',
          registration_opens: '2025-12-07T00:00:00',
          organization: { id: 1654 },
        },
      }),
    ])
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'closed', eventId: 21392 })
  })

  it('none when no listing names that season', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([listing()])
    expect(await getMembershipSeasonStatus(2027)).toEqual({ status: 'none' })
  })

  it('ignores listings from other organisations', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([
      listing({
        name: 'Other Club Membership 2027',
        event: {
          id: 555,
          status: 'AC',
          registration_opens: '2025-12-07T00:00:00',
          organization: { id: 999 },
        },
      }),
    ])
    expect(await getMembershipSeasonStatus(2027)).toEqual({ status: 'none' })
  })

  it('ignores listings whose name has no year', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([listing({ name: 'Randonneurs Ontario Membership' })])
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'none' })
  })

  it('ignores same-organisation listings that are not membership events', async () => {
    const { getMembershipSeasonStatus } = await load()
    const series = listing({
      name: 'Randonneurs Ontario Brevet Series 2026',
      event: {
        id: 777,
        status: 'AC',
        registration_opens: '2025-12-07T00:00:00',
        organization: { id: 1654 },
      },
    })
    respond([series])
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'none' })

    const again = await load()
    respond([listing(), series])
    expect(await again.getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
  })

  it('caches the listing for subsequent calls', async () => {
    const { getMembershipSeasonStatus } = await load()
    respond([listing()])
    await getMembershipSeasonStatus(2026)
    await getMembershipSeasonStatus(2026)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  describe('cache expiry', () => {
    const minutes = (n: number) => n * 60 * 1000

    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps a successful listing for an hour', async () => {
      vi.useFakeTimers()
      const { getMembershipSeasonStatus } = await load()
      respond([listing()])
      await getMembershipSeasonStatus(2026)
      vi.advanceTimersByTime(minutes(59))
      await getMembershipSeasonStatus(2026)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      respond([listing()])
      vi.advanceTimersByTime(minutes(2))
      await getMembershipSeasonStatus(2026)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('keeps serving the last good listing when a refetch fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.useFakeTimers()
      const { getMembershipSeasonStatus } = await load()
      respond([listing()])
      await getMembershipSeasonStatus(2026)
      vi.advanceTimersByTime(minutes(61))
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(minutes(5))
      expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(minutes(6))
      respond([
        listing({
          event: {
            id: 99,
            status: 'CL',
            registration_opens: '2025-12-07T00:00:00',
            organization: { id: 1654 },
          },
        }),
      ])
      expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'closed', eventId: 99 })
    })

    it('retries a failed discovery after 10 minutes', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.useFakeTimers()
      const { getMembershipSeasonStatus } = await load()
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      await getMembershipSeasonStatus(2026)
      vi.advanceTimersByTime(minutes(9))
      await getMembershipSeasonStatus(2026)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      respond([listing()])
      vi.advanceTimersByTime(minutes(2))
      expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  it('falls back to CCN_MEMBERSHIP_EVENT_IDS as open when discovery throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getMembershipSeasonStatus } = await load()
    process.env.CCN_MEMBERSHIP_EVENT_IDS = '2026:21392'
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'open', eventId: 21392 })
    expect(warn).toHaveBeenCalled()
  })

  it('returns unknown when discovery throws and nothing is seeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getMembershipSeasonStatus } = await load()
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    expect(await getMembershipSeasonStatus(2026)).toEqual({ status: 'unknown' })
    expect(warn).toHaveBeenCalled()
  })

  it('returns none, not unknown, when a refetch fails but the last good listing lacks the season', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    try {
      const { getMembershipSeasonStatus } = await load()
      respond([listing()])
      await getMembershipSeasonStatus(2026)
      vi.advanceTimersByTime(61 * 60 * 1000)
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      expect(await getMembershipSeasonStatus(2027)).toEqual({ status: 'none' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('shares one listing request between concurrent cold-start callers', async () => {
    const { getMembershipSeasonStatus } = await load()
    let release!: () => void
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, json: async () => ({ count: 1, results: [listing()] }) })
        })
    )
    const first = getMembershipSeasonStatus(2026)
    const second = getMembershipSeasonStatus(2026)
    release()
    expect(await Promise.all([first, second])).toEqual([
      { status: 'open', eventId: 21392 },
      { status: 'open', eventId: 21392 },
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('opens a cached listing once the clock passes registration_opens, without a refetch', async () => {
    // registration_opens is Toronto local time with no offset. Midnight
    // Toronto on 2026-12-07 is 05:00 UTC (EST, UTC-5). Run in UTC like
    // Vercel: Date.parse reads an offset-less string in the process zone.
    const originalTz = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers({ now: new Date('2026-12-07T04:30:00Z') })
    try {
      const { getMembershipSeasonStatus } = await load()
      respond([
        listing({
          name: 'Randonneurs Ontario Membership 2027',
          event: {
            id: 23000,
            status: 'AC',
            registration_opens: '2026-12-07T00:00:00',
            organization: { id: 1654 },
          },
        }),
      ])
      // 23:30 Toronto on Dec 6: still closed. Date.parse would read the
      // string as UTC midnight and call it open already.
      expect(await getMembershipSeasonStatus(2027)).toEqual({ status: 'closed', eventId: 23000 })
      vi.setSystemTime(new Date('2026-12-07T05:01:00Z'))
      expect(await getMembershipSeasonStatus(2027)).toEqual({ status: 'open', eventId: 23000 })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    }
  })

  it('calls the club-listings URL under CCN_API_BASE', async () => {
    const { getMembershipSeasonStatus } = await load()
    process.env.CCN_API_BASE = 'https://example.test/rest/v2'
    try {
      respond([listing()])
      await getMembershipSeasonStatus(2026)
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://example.test/rest/v2/listing_app/club-listings/?search=Randonneurs+Ontario'
      )
    } finally {
      delete process.env.CCN_API_BASE
    }
  })
})
