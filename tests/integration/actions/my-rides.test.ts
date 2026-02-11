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

import { getMyUpcomingRides } from '@/lib/actions/my-rides'

function setupRiderLookup(rider: { id: string } | null) {
  // First .from('riders') call chain: .select().eq().single()
  const riderChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: rider,
      error: rider ? null : { code: 'PGRST116' },
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

    expect(riderChain.eq).toHaveBeenCalledWith('email', 'john@example.com')
  })

  it('returns upcoming events for a known rider', async () => {
    const riderChain = setupRiderLookup({ id: 'rider-1' })
    const regChain = setupRegistrationsQuery([
      {
        events: {
          slug: 'test-ride-200km-2026-04-15',
          name: 'Test Ride',
          event_date: '2026-04-15',
          distance_km: 200,
          start_time: '07:00',
          start_location: 'City Hall',
          status: 'scheduled',
          chapters: { name: 'Toronto' },
        },
      },
      {
        events: {
          slug: 'spring-ride-100km-2026-05-01',
          name: 'Spring Ride',
          event_date: '2026-05-01',
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
      slug: 'test-ride-200km-2026-04-15',
      name: 'Test Ride',
      date: '2026-04-15',
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
          slug: 'cancelled-ride-200km-2026-06-01',
          name: 'Cancelled Ride',
          event_date: '2026-06-01',
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
          event_date: '2026-08-01',
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
          event_date: '2026-04-01',
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
          event_date: '2026-06-01',
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
