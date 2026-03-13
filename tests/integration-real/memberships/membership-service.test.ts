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
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

describe('membership service (real DB)', () => {
  const supabase = getTestSupabase()
  const pastDate = daysFromNow(-7)
  const futureDate = daysFromNow(30)

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    // Clean up any leftover test data (in case a previous run crashed)
    const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed in dependency order
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-rider',
        first_name: 'IntTest',
        last_name: 'Rider',
      }),
      'insert rider'
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
  })

  afterAll(async () => {
    const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)
  })

  describe('getMembershipForRider', () => {
    let searchCCNMembership: ReturnType<typeof vi.fn>

    beforeAll(async () => {
      const mod = await import('@/lib/ccn/client')
      searchCCNMembership = vi.mocked(mod.searchCCNMembership)
    })

    afterEach(async () => {
      // Clean up any memberships created during tests
      await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
      vi.resetAllMocks()
    })

    it('returns cached membership from DB', async () => {
      // Seed a membership row
      await checked(
        supabase.from('memberships').insert({
          id: IDS.membership,
          rider_id: IDS.rider,
          season: 2026,
          membership_id: 42,
          type: 'Individual Membership',
        }),
        'insert membership'
      )

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

      expect(result).toEqual({
        found: true,
        membershipId: 42,
        type: 'Individual Membership',
      })
      expect(searchCCNMembership).not.toHaveBeenCalled()
    })

    it('fetches from CCN when not cached, caches in DB', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 99,
        type: 'Individual Membership',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

      expect(result).toEqual({
        found: true,
        membershipId: 99,
        type: 'Individual Membership',
      })
      expect(searchCCNMembership).toHaveBeenCalledWith('IntTest', 'Rider')

      // Verify the membership was cached in DB
      const { data } = await supabase
        .from('memberships')
        .select('membership_id, type, season')
        .eq('rider_id', IDS.rider)
        .eq('season', 2026)
        .single()

      expect(data).toMatchObject({
        membership_id: 99,
        type: 'Individual Membership',
        season: 2026,
      })
    })

    it('second call uses DB cache, not CCN', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 99,
        type: 'Individual Membership',
      })

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      // First call — hits CCN, caches in DB
      const result1 = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')
      expect(result1.found).toBe(true)
      expect(searchCCNMembership).toHaveBeenCalledTimes(1)

      // Second call — should use DB cache
      const result2 = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')
      expect(result2).toEqual(result1)
      expect(searchCCNMembership).toHaveBeenCalledTimes(1) // still 1
    })

    it('returns found:false when CCN has no match', async () => {
      searchCCNMembership.mockResolvedValue({ found: false })

      const { getMembershipForRider } = await import('@/lib/memberships/service')
      const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

      expect(result).toEqual({ found: false })

      // Verify nothing was cached
      const { data } = await supabase
        .from('memberships')
        .select('id')
        .eq('rider_id', IDS.rider)
        .eq('season', 2026)

      expect(data).toEqual([])
    })

    it('propagates CCN API error', async () => {
      searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      await expect(getMembershipForRider(IDS.rider, 'IntTest', 'Rider')).rejects.toThrow(
        'CCN API error'
      )

      // Verify nothing was cached
      const { data } = await supabase
        .from('memberships')
        .select('id')
        .eq('rider_id', IDS.rider)
        .eq('season', 2026)

      expect(data).toEqual([])
    })

    it('throws when CCN_ENDPOINT not set', async () => {
      searchCCNMembership.mockRejectedValue(new Error('CCN_ENDPOINT environment variable not set'))

      const { getMembershipForRider } = await import('@/lib/memberships/service')

      await expect(getMembershipForRider(IDS.rider, 'IntTest', 'Rider')).rejects.toThrow(
        'CCN_ENDPOINT'
      )
    })
  })

  describe('isTrialUsed', () => {
    afterEach(async () => {
      // Clean up results and registrations created during tests
      const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
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
          season: 2026,
          distance_km: 200,
        }),
        'insert finished result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider)
      expect(result).toBe(true)
    })

    it('returns true when rider has DNF result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.dnfResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'dnf',
          season: 2026,
          distance_km: 200,
        }),
        'insert dnf result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider)
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
      const result = await isTrialUsed(IDS.rider)
      expect(result).toBe(true)
    })

    it('returns false when rider has no results or registrations', async () => {
      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider)
      expect(result).toBe(false)
    })

    it('returns false when rider has only DNS result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.dnsResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'dns',
          season: 2026,
          distance_km: 200,
        }),
        'insert dns result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider)
      expect(result).toBe(false)
    })

    it('returns false when rider has only pending result', async () => {
      await checked(
        supabase.from('results').insert({
          id: IDS.pendingResult,
          rider_id: IDS.rider,
          event_id: IDS.completedEvent,
          status: 'pending',
          season: 2026,
          distance_km: 200,
        }),
        'insert pending result'
      )

      const { isTrialUsed } = await import('@/lib/memberships/service')
      const result = await isTrialUsed(IDS.rider)
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
      const result = await isTrialUsed(IDS.rider)
      expect(result).toBe(false)
    })
  })
})
