import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before imports
const mockFrom = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}))

import { getAccountRides } from '@/lib/account/rides'

/**
 * ISO date string (YYYY-MM-DD) `days` from today, in UTC. `getAccountRides`
 * computes "today" as `new Date().toISOString().split('T')[0]` (UTC), so
 * fixtures must use the same basis. Dates are relative — not hardcoded — so
 * "upcoming"/"past" fixtures don't silently flip as the calendar advances.
 */
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'toronto-200',
    name: 'Toronto 200',
    event_date: isoDaysFromNow(10),
    status: 'scheduled',
    distance_km: 200,
    chapters: { name: 'Toronto' },
    ...overrides,
  }
}

/** Chain for `.from('registrations').select(...).eq('rider_id', riderId)`. */
function makeRegistrationsChain(data: unknown[] | null, error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ data, error })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq }
}

/** Chain for `.from('results').select('event_id, status').eq('rider_id', riderId)`. */
function makeResultsChain(data: unknown[] | null, error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ data, error })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq }
}

function mockTables(registrations: unknown[] | null, results: unknown[] | null) {
  const regChain = makeRegistrationsChain(registrations)
  const resChain = makeResultsChain(results)
  mockFrom.mockImplementation((table: string) => {
    if (table === 'registrations') return regChain
    if (table === 'results') return resChain
    throw new Error(`Unexpected table: ${table}`)
  })
  return { regChain, resChain }
}

describe('getAccountRides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries both registrations and results filtered by rider_id', async () => {
    const { regChain, resChain } = mockTables([], [])

    await getAccountRides('rider-1')

    expect(mockFrom).toHaveBeenCalledWith('registrations')
    expect(mockFrom).toHaveBeenCalledWith('results')
    expect(regChain.eq).toHaveBeenCalledWith('rider_id', 'rider-1')
    expect(resChain.eq).toHaveBeenCalledWith('rider_id', 'rider-1')
  })

  it('attaches resultStatus from the results-by-event map when a result exists', async () => {
    mockTables(
      [
        {
          id: 'reg-1',
          event_id: 'event-1',
          management_token: 'tok-1',
          status: 'registered',
          events: baseEvent({ event_date: isoDaysFromNow(-5), status: 'completed' }),
        },
      ],
      [{ event_id: 'event-1', status: 'finished' }]
    )

    const { past } = await getAccountRides('rider-1')

    expect(past).toHaveLength(1)
    expect(past[0].resultStatus).toBe('finished')
  })

  it('leaves resultStatus null when no result matches the event', async () => {
    mockTables(
      [
        {
          id: 'reg-1',
          event_id: 'event-1',
          management_token: 'tok-1',
          status: 'registered',
          events: baseEvent({ event_date: isoDaysFromNow(10) }),
        },
      ],
      // A result for a different event should not match reg-1's event.
      [{ event_id: 'event-other', status: 'finished' }]
    )

    const { upcoming } = await getAccountRides('rider-1')

    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].resultStatus).toBeNull()
  })

  it('runs the mapped rows through splitRides (one upcoming, one past)', async () => {
    mockTables(
      [
        {
          id: 'reg-upcoming',
          event_id: 'event-1',
          management_token: 'tok-1',
          status: 'registered',
          events: baseEvent({ event_date: isoDaysFromNow(20), status: 'scheduled' }),
        },
        {
          id: 'reg-past',
          event_id: 'event-2',
          management_token: 'tok-2',
          status: 'registered',
          events: baseEvent({ event_date: isoDaysFromNow(-20), status: 'completed' }),
        },
      ],
      []
    )

    const { upcoming, past } = await getAccountRides('rider-1')

    expect(upcoming.map((r) => r.registrationId)).toEqual(['reg-upcoming'])
    expect(past.map((r) => r.registrationId)).toEqual(['reg-past'])
  })

  it('skips a non-cancelled registration with no management_token and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockTables(
      [
        {
          id: 'reg-broken',
          event_id: 'event-1',
          management_token: null,
          status: 'registered',
          events: baseEvent({ event_date: isoDaysFromNow(10) }),
        },
      ],
      []
    )

    const { upcoming, past } = await getAccountRides('rider-1')

    expect(upcoming).toEqual([])
    expect(past).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reg-broken'))
    warn.mockRestore()
  })

  it('keeps a cancelled registration with no management_token, rendered with an empty token', async () => {
    mockTables(
      [
        {
          id: 'reg-cancelled',
          event_id: 'event-1',
          management_token: null,
          status: 'cancelled',
          events: baseEvent({ event_date: isoDaysFromNow(-10), status: 'completed' }),
        },
      ],
      []
    )

    const { past } = await getAccountRides('rider-1')

    expect(past).toHaveLength(1)
    expect(past[0].managementToken).toBe('')
    expect(past[0].registrationStatus).toBe('cancelled')
  })
})
