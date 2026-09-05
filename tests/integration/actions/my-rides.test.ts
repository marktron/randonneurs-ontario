import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before imports
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}))

let mockAccount: { rider: { id: string; first_name: string } | null } | null = null
vi.mock('@/lib/auth/get-rider', () => ({ getAccount: vi.fn(() => Promise.resolve(mockAccount)) }))

import { getMyUpcomingRides, getAccountUpcomingRides } from '@/lib/actions/my-rides'

/**
 * ISO date string (YYYY-MM-DD) `days` from today, in UTC. The action computes
 * "today" as `new Date().toISOString().split('T')[0]` (UTC), so fixtures must
 * use the same basis. Dates are relative — not hardcoded — so "upcoming"
 * fixtures don't silently become "past" as the calendar advances.
 */
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]
}

function setupRiderLookup(rider: { id: string } | null) {
  // First .from('riders') call chain: .select().ilike().maybeSingle()
  const riderChain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: rider,
      error: null,
    }),
  }
  return riderChain
}

function setupRegistrationsQuery(registrations: unknown[] | null, error: unknown = null) {
  const regChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  // Last .eq() in the chain resolves to data
  regChain.eq.mockReturnThis()
  // Override: the second .eq() call resolves to the result
  let eqCallCount = 0
  regChain.eq.mockImplementation(() => {
    eqCallCount++
    if (eqCallCount >= 2) {
      return Promise.resolve({ data: registrations, error })
    }
    return regChain
  })
  return regChain
}

describe('getMyUpcomingRides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] for empty email', async () => {
    const result = await getMyUpcomingRides('')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns [] for whitespace-only email', async () => {
    const result = await getMyUpcomingRides('   ')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns [] for unknown email', async () => {
    const riderChain = setupRiderLookup(null)
    mockFrom.mockReturnValue(riderChain)

    const result = await getMyUpcomingRides('unknown@example.com')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('normalizes email to lowercase and trims', async () => {
    const riderChain = setupRiderLookup(null)
    mockFrom.mockReturnValue(riderChain)

    await getMyUpcomingRides('  John@Example.COM  ')

    expect(riderChain.ilike).toHaveBeenCalledWith('email', 'john@example.com')
  })

  it('returns upcoming events for a known rider', async () => {
    const firstDate = isoDaysFromNow(43)
    const secondDate = isoDaysFromNow(60)
    const firstSlug = `test-ride-200km-${firstDate}`
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: firstSlug,
          name: 'Test Ride',
          event_date: firstDate,
          distance_km: 200,
          start_time: '07:00',
          start_location: 'City Hall',
          status: 'scheduled',
          chapters: { name: 'Toronto' },
        },
      },
      {
        events: {
          slug: `spring-ride-100km-${secondDate}`,
          name: 'Spring Ride',
          event_date: secondDate,
          distance_km: 100,
          start_time: '08:00',
          start_location: 'Park',
          status: 'scheduled',
          chapters: { name: 'Ottawa' },
        },
      },
    ])

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return riderChain
      return regChain
    })

    const result = await getMyUpcomingRides('test@example.com')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data![0]).toEqual({
      slug: firstSlug,
      name: 'Test Ride',
      date: firstDate,
      distance: 200,
      startTime: '07:00',
      startLocation: 'City Hall',
      chapterName: 'Toronto',
    })
    expect(result.data![1].name).toBe('Spring Ride')
  })

  it('excludes past events', async () => {
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: 'past-ride-200km-2020-01-01',
          name: 'Past Ride',
          event_date: '2020-01-01',
          distance_km: 200,
          start_time: '07:00',
          start_location: 'City Hall',
          status: 'scheduled',
          chapters: { name: 'Toronto' },
        },
      },
    ])

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return riderChain
      return regChain
    })

    const result = await getMyUpcomingRides('test@example.com')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('excludes cancelled events', async () => {
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          // Future date, so the event is excluded purely because it is
          // cancelled — not because it has fallen into the past.
          slug: 'cancelled-ride-200km',
          name: 'Cancelled Ride',
          event_date: isoDaysFromNow(30),
          distance_km: 200,
          start_time: '07:00',
          start_location: 'City Hall',
          status: 'cancelled',
          chapters: { name: 'Toronto' },
        },
      },
    ])

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return riderChain
      return regChain
    })

    const result = await getMyUpcomingRides('test@example.com')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('sorts results by date ascending', async () => {
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: 'later-ride',
          name: 'Later Ride',
          event_date: isoDaysFromNow(60),
          distance_km: 300,
          start_time: '06:00',
          start_location: 'Start',
          status: 'scheduled',
          chapters: { name: 'Huron' },
        },
      },
      {
        events: {
          slug: 'earlier-ride',
          name: 'Earlier Ride',
          event_date: isoDaysFromNow(30),
          distance_km: 200,
          start_time: '07:00',
          start_location: 'Start',
          status: 'scheduled',
          chapters: { name: 'Toronto' },
        },
      },
    ])

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return riderChain
      return regChain
    })

    const result = await getMyUpcomingRides('test@example.com')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data![0].name).toBe('Earlier Ride')
    expect(result.data![1].name).toBe('Later Ride')
  })

  it('defaults start_time and start_location when null', async () => {
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: 'minimal-ride',
          name: 'Minimal Ride',
          event_date: isoDaysFromNow(30),
          distance_km: 200,
          start_time: null,
          start_location: null,
          status: 'scheduled',
          chapters: null,
        },
      },
    ])

    let fromCallCount = 0
    mockFrom.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return riderChain
      return regChain
    })

    const result = await getMyUpcomingRides('test@example.com')

    expect(result.success).toBe(true)
    expect(result.data![0].startTime).toBe('08:00')
    expect(result.data![0].startLocation).toBe('')
    expect(result.data![0].chapterName).toBe('')
  })
})

describe('getAccountUpcomingRides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccount = null
  })

  it('reports signedIn false without touching the database when signed out', async () => {
    const result = await getAccountUpcomingRides()
    expect(result).toEqual({ success: true, data: { signedIn: false, firstName: '', rides: [] } })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('reports signedIn true with no rides for an unlinked account', async () => {
    mockAccount = { rider: null }
    const result = await getAccountUpcomingRides()
    expect(result.data).toEqual({ signedIn: true, firstName: '', rides: [] })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fetches by rider id, never by email, for a linked account', async () => {
    mockAccount = { rider: { id: 'rider-1', first_name: 'Pat' } }
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: 'toronto-200',
          name: 'Toronto 200',
          event_date: isoDaysFromNow(10),
          distance_km: 200,
          start_time: '07:00',
          start_location: 'Start',
          status: 'scheduled',
          chapters: { name: 'Toronto' },
        },
      },
    ])
    mockFrom.mockReturnValueOnce(regChain)
    const result = await getAccountUpcomingRides()
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('registrations')
    expect(regChain.eq).toHaveBeenCalledWith('rider_id', 'rider-1')
    expect(result.data?.firstName).toBe('Pat')
    expect(result.data?.rides.map((r) => r.slug)).toEqual(['toronto-200'])
  })
})
