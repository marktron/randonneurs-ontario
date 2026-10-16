import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'

vi.mock('@/lib/ccn/client')

const TORONTO_CHAPTER_ID = 'ad83d0b9-4d25-472b-9d3e-5732730d761c'

const IDS = {
  rider: '00000000-1a10-4000-a000-000000000001',
  route: '00000000-1a10-4000-a000-000000000002',
  completedEvent: '00000000-1a10-4000-a000-000000000003',
  scheduledEvent: '00000000-1a10-4000-a000-000000000004',
  finishedResult: '00000000-1a10-4000-a000-000000000005',
  dnsResult: '00000000-1a10-4000-a000-000000000006',
  registration: '00000000-1a10-4000-a000-000000000007',
  membership: '00000000-1a10-4000-a000-000000000008',
  pendingResult: '00000000-1a10-4000-a000-000000000009',
  dnfResult: '00000000-1a10-4000-a000-00000000000a',
  pastRegistration: '00000000-1a10-4000-a000-00000000000b',
  otlResult: '00000000-1a10-4000-a000-00000000000c',
  cancelledRegistration: '00000000-1a10-4000-a000-00000000000d',
  dqResult: '00000000-1a10-4000-a000-00000000000e',
  otherRider: '00000000-1a10-4000-a000-00000000000f',
  otherRiderResult: '00000000-1a10-4000-a000-000000000010',
  nextSeasonEvent: '00000000-1a10-4000-a000-000000000011',
  nextSeasonRegistration: '00000000-1a10-4000-a000-000000000012',
  lastYearEvent: '00000000-1a10-4000-a000-000000000013',
  lastYearResult: '00000000-1a10-4000-a000-000000000014',
}

const SEASON = new Date().getFullYear()

function lookup(overrides: { season?: number; chapterId?: string } = {}) {
  return {
    riderId: IDS.rider,
    firstName: 'IntTest',
    lastName: 'Rider',
    season: SEASON,
    ...overrides,
  }
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const ALL_EVENT_IDS = [
  IDS.completedEvent,
  IDS.scheduledEvent,
  IDS.nextSeasonEvent,
  IDS.lastYearEvent,
]

describe('membership service (real DB)', () => {
  const supabase = getTestSupabase()
  const pastDate = daysFromNow(-7)
  const futureDate = daysFromNow(30)
  const nextSeasonDate = `${SEASON + 1}-01-15`
  const lastYearDate = `${SEASON - 1}-06-15`

  beforeAll(async () => {
    // Clean up any leftover test data (in case a previous run crashed)
    const eventIds = ALL_EVENT_IDS
    const riderIds = [IDS.rider, IDS.otherRider]
    await supabase.from('rider_memberships').delete().in('rider_id', riderIds)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', riderIds)

    // Seed in dependency order
    await checked(
      supabase.from('riders').insert([
        { id: IDS.rider, slug: 'inttest-rider', first_name: 'IntTest', last_name: 'Rider' },
        { id: IDS.otherRider, slug: 'inttest-other', first_name: 'Other', last_name: 'Rider' },
      ]),
      'insert riders'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-route',
        name: 'IntTest Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.completedEvent,
        slug: `inttest-completed-200km-${pastDate}`,
        name: 'IntTest Completed',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: pastDate,
        status: 'completed',
      }),
      'insert completed event'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-scheduled-200km-${futureDate}`,
        name: 'IntTest Scheduled',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: futureDate,
        status: 'scheduled',
      }),
      'insert scheduled event'
    )

    await checked(
      supabase.from('events').insert([
        {
          id: IDS.nextSeasonEvent,
          slug: `inttest-nextseason-200km-${nextSeasonDate}`,
          name: 'IntTest Next Season',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: nextSeasonDate,
          status: 'scheduled',
        },
        {
          id: IDS.lastYearEvent,
          slug: `inttest-lastyear-200km-${lastYearDate}`,
          name: 'IntTest Last Year',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: lastYearDate,
          status: 'completed',
        },
      ]),
      'insert next-season and last-year events'
    )
  })

  afterAll(async () => {
    const eventIds = ALL_EVENT_IDS
    const riderIds = [IDS.rider, IDS.otherRider]
    await supabase.from('rider_memberships').delete().in('rider_id', riderIds)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', riderIds)
  })

  describe('getMembershipForRider', () => {
    let searchCCNMembership: ReturnType<typeof vi.fn>

    beforeAll(async () => {
      const mod = await import('@/lib/ccn/client')
      searchCCNMembership = vi.mocked(mod.searchCCNMembership)
    })

    afterEach(async () => {
      // Clean up any memberships created during tests
      await supabase.from('rider_memberships').delete().eq('rider_id', IDS.rider)
      vi.resetAllMocks()
    })

    it('returns cached membership from rider_memberships', async () => {
      // Seed a rider_memberships row (as if from CSV import or previous registration)
      // Use high ccn_id values to avoid conflicts with registration tests running in parallel
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100042,
          membership_type: 'Individual Membership',
          city: 'Toronto',
          country: 'Canada',
          chapter_id: TORONTO_CHAPTER_ID,
        }),
        'insert rider_membership'
      )

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup())

      expect(result).toEqual({
        found: true,
        membershipId: 100042,
        type: 'Individual Membership',
      })
      expect(searchCCNMembership).not.toHaveBeenCalled()
    })

    it('fetches from CCN when not cached, writes to rider_memberships', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100099,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup({ chapterId: TORONTO_CHAPTER_ID }))

      expect(result).toEqual({
        found: true,
        membershipId: 100099,
        type: 'Individual Membership',
      })
      expect(searchCCNMembership).toHaveBeenCalledWith('IntTest', 'Rider', SEASON)

      // Verify the membership was cached in rider_memberships
      const { data } = await supabase
        .from('rider_memberships')
        .select('ccn_id, membership_type, city, country, season, chapter_id')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)
        .single()

      expect(data).toMatchObject({
        ccn_id: 100099,
        membership_type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
        season: SEASON,
        chapter_id: TORONTO_CHAPTER_ID,
      })
    })

    it('second call uses DB cache, not CCN', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100099,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      // First call — hits CCN, caches in rider_memberships
      const result1 = await getMembershipForRider(lookup())
      expect(result1.found).toBe(true)
      expect(searchCCNMembership).toHaveBeenCalledTimes(1)

      // Second call — should use DB cache
      const result2 = await getMembershipForRider(lookup())
      expect(result2).toEqual(result1)
      expect(searchCCNMembership).toHaveBeenCalledTimes(1) // still 1
    })

    it('returns found:false when CCN has no match', async () => {
      searchCCNMembership.mockResolvedValue({ found: false })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup())

      expect(result).toEqual({ found: false })

      // Verify nothing was cached
      const { data } = await supabase
        .from('rider_memberships')
        .select('id')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)

      expect(data).toEqual([])
    })

    it('propagates CCN API error', async () => {
      searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      await expect(getMembershipForRider(lookup())).rejects.toThrow('CCN API error')

      // Verify nothing was cached
      const { data } = await supabase
        .from('rider_memberships')
        .select('id')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)

      expect(data).toEqual([])
    })

    it('throws when CCN_ENDPOINT not set', async () => {
      searchCCNMembership.mockRejectedValue(new Error('CCN_ENDPOINT environment variable not set'))

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      await expect(getMembershipForRider(lookup())).rejects.toThrow('CCN_ENDPOINT')
    })

    it('looks up and caches under the requested season, not the current one', async () => {
      const nextSeason = SEASON + 1
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100110,
          membership_type: 'Individual Membership',
        }),
        'insert current-season membership'
      )
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100111,
        type: 'Additional Family Member',
        city: 'Toronto',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup({ season: nextSeason }))

      expect(result).toEqual({
        found: true,
        membershipId: 100111,
        type: 'Additional Family Member',
      })
      expect(searchCCNMembership).toHaveBeenCalledWith('IntTest', 'Rider', nextSeason)

      const { data } = await supabase
        .from('rider_memberships')
        .select('season, ccn_id, membership_type')
        .eq('rider_id', IDS.rider)
        .order('season')
      expect(data).toEqual([
        { season: SEASON, ccn_id: 100110, membership_type: 'Individual Membership' },
        { season: nextSeason, ccn_id: 100111, membership_type: 'Additional Family Member' },
      ])
    })

    it('returns found:false for a season CCN has no event for', async () => {
      const nextSeason = SEASON + 1
      searchCCNMembership.mockResolvedValue({ found: false })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup({ season: nextSeason }))

      expect(result).toEqual({ found: false })
      expect(searchCCNMembership).toHaveBeenCalledWith('IntTest', 'Rider', nextSeason)

      const { data } = await supabase
        .from('rider_memberships')
        .select('id')
        .eq('rider_id', IDS.rider)
      expect(data).toEqual([])
    })

    // --- Trial Member re-check tests ---

    it('re-checks CCN when existing membership is Trial Member', async () => {
      // Seed a Trial Member row
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100050,
          membership_type: 'Trial Member',
        }),
        'insert trial membership'
      )

      // CCN now returns full membership (rider upgraded)
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100050,
        type: 'Individual Membership',
        city: 'Ottawa',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup())

      // Should return the upgraded type
      expect(result).toEqual({
        found: true,
        membershipId: 100050,
        type: 'Individual Membership',
      })
      expect(searchCCNMembership).toHaveBeenCalled()

      // Verify the row was updated in rider_memberships
      const { data } = await supabase
        .from('rider_memberships')
        .select('ccn_id, membership_type, city, country')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)
        .single()

      expect(data).toMatchObject({
        ccn_id: 100050,
        membership_type: 'Individual Membership',
        city: 'Ottawa',
        country: 'Canada',
      })
    })

    it('keeps Trial Member when CCN still returns Trial', async () => {
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100060,
          membership_type: 'Trial Member',
        }),
        'insert trial membership'
      )

      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100060,
        type: 'Trial Member',
        city: 'Toronto',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup())

      expect(result).toEqual({
        found: true,
        membershipId: 100060,
        type: 'Trial Member',
      })
    })

    it('preserves Trial Member when CCN returns not-found (graceful degradation)', async () => {
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100070,
          membership_type: 'Trial Member',
        }),
        'insert trial membership'
      )

      // CCN returns not found (e.g. API issue)
      searchCCNMembership.mockResolvedValue({ found: false })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(lookup())

      // Should still return the existing Trial data
      expect(result).toEqual({
        found: true,
        membershipId: 100070,
        type: 'Trial Member',
      })
    })

    // --- Chapter assignment tests ---

    it('does not overwrite existing chapter_id from CSV import', async () => {
      const OTTAWA_CHAPTER_ID = '6c44658e-8f0d-4569-9f79-a5f2d1dd6db6'

      // Seed Trial row with Ottawa chapter (from CSV)
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100080,
          membership_type: 'Trial Member',
          chapter_id: OTTAWA_CHAPTER_ID,
        }),
        'insert trial membership with chapter'
      )

      // CCN returns upgrade — but event is Toronto chapter
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100080,
        type: 'Individual Membership',
        city: 'Ottawa',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      await getMembershipForRider(lookup({ chapterId: TORONTO_CHAPTER_ID }))

      // Chapter should remain Ottawa (not overwritten to Toronto)
      const { data } = await supabase
        .from('rider_memberships')
        .select('chapter_id')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)
        .single()

      expect(data?.chapter_id).toBe(OTTAWA_CHAPTER_ID)
    })

    it('sets chapter_id when existing row has none', async () => {
      // Seed Trial row without chapter
      await checked(
        supabase.from('rider_memberships').insert({
          rider_id: IDS.rider,
          season: SEASON,
          ccn_id: 100090,
          membership_type: 'Trial Member',
          chapter_id: null,
        }),
        'insert trial membership without chapter'
      )

      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 100090,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      await getMembershipForRider(lookup({ chapterId: TORONTO_CHAPTER_ID }))

      const { data } = await supabase
        .from('rider_memberships')
        .select('chapter_id')
        .eq('rider_id', IDS.rider)
        .eq('season', SEASON)
        .single()

      expect(data?.chapter_id).toBe(TORONTO_CHAPTER_ID)
    })
  })

  describe('isTrialUsed', () => {
    afterEach(async () => {
      // Clean up results and registrations created during tests
      const eventIds = ALL_EVENT_IDS
      await supabase.from('results').delete().in('event_id', eventIds)
      await supabase.from('registrations').delete().in('event_id', eventIds)
    })

    it('returns true when rider has finished result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.finishedResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'finished',
          season: SEASON,
          distance_km: 200,
        }),
        'insert finished result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(true)
    })

    it('returns true when rider has DNF result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.dnfResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'dnf',
          season: SEASON,
          distance_km: 200,
        }),
        'insert dnf result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(true)
    })

    it('returns true when rider has upcoming registration', async () => {
      await checked(
        supabase.from('registrations').insert({
          id: IDS.registration,
          rider_id: IDS.rider,
          event_id: IDS.scheduledEvent,
          status: 'registered',
        }),
        'insert registration'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(true)
    })

    it('returns false when rider has no results or registrations', async () => {
      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    it('returns true when rider has OTL result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.otlResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'otl',
          season: SEASON,
          distance_km: 200,
        }),
        'insert otl result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(true)
    })

    it('returns true when rider has DQ result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.dqResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'dq',
          season: SEASON,
          distance_km: 200,
        }),
        'insert dq result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(true)
    })

    it("does not count another rider's result", async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.otherRiderResult,
          rider_id: IDS.otherRider,
          event_id: IDS.completedEvent,
          status: 'finished',
          season: SEASON,
          distance_km: 200,
        }),
        'insert other rider result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    it('returns false when rider has only DNS result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.dnsResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'dns',
          season: SEASON,
          distance_km: 200,
        }),
        'insert dns result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    it('returns false when rider has only pending result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.pendingResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'pending',
          season: SEASON,
          distance_km: 200,
        }),
        'insert pending result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    it('returns false when rider has cancelled registration for future event', async () => {
      await checked(
        supabase.from('registrations').insert({
          id: IDS.cancelledRegistration,
          rider_id: IDS.rider,
          event_id: IDS.scheduledEvent, // future date
          status: 'cancelled',
        }),
        'insert cancelled registration'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    it('returns false when rider has registration for past event only', async () => {
      await checked(
        supabase.from('registrations').insert({
          id: IDS.pastRegistration,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent, // past date
          status: 'registered',
        }),
        'insert past registration'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider, SEASON)
      expect(result).toBe(false)
    })

    describe('is season-scoped', () => {
      it('ignores a finished result from another season', async () => {
        await checked(
          supabase.from('results').insert({
            id: IDS.lastYearResult,
            rider_id: IDS.rider,
            event_id: IDS.lastYearEvent,
            status: 'finished',
            season: SEASON - 1,
            distance_km: 200,
          }),
          'insert last-year result'
        )

        const { isTrialUsed } = await import('@/lib/memberships/service')
        expect(await isTrialUsed(IDS.rider, SEASON)).toBe(false)
        expect(await isTrialUsed(IDS.rider, SEASON - 1)).toBe(true)
      })

      it('ignores an upcoming registration in another season', async () => {
        await checked(
          supabase.from('registrations').insert({
            id: IDS.nextSeasonRegistration,
            rider_id: IDS.rider,
            event_id: IDS.nextSeasonEvent,
            status: 'registered',
          }),
          'insert next-season registration'
        )

        const { isTrialUsed } = await import('@/lib/memberships/service')
        expect(await isTrialUsed(IDS.rider, SEASON)).toBe(false)
        expect(await isTrialUsed(IDS.rider, SEASON + 1)).toBe(true)
      })
    })
  })
})
