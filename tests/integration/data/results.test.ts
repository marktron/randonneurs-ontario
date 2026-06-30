import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for results data fetching functions.
 *
 * These tests focus on:
 * 1. Data transformation
 * 2. Error handling
 * 3. Empty state handling
 * 4. Year/chapter filtering
 */

// Mock dependencies
vi.mock('@/lib/supabase', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    // Include ALL methods that might be called in query chains
    const methods = [
      'select',
      'eq',
      'neq',
      'gte',
      'lte',
      'gt',
      'lt',
      'not',
      'or',
      'in',
      'order',
      'limit',
      'range',
      'single',
      'maybeSingle',
      'insert',
      'update',
      'delete',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    builder.then = vi.fn((resolve) => {
      resolve({ data: [], error: null })
    })
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
      // Use mockReset to clear implementation queue, then set default
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.maybeSingle.mockReset()
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
    },
    __mockEventsFound: (events: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: events, error: null })
      })
    },
    __mockRiderFound: (rider: unknown) => {
      queryBuilder.maybeSingle.mockResolvedValueOnce({ data: rider, error: null })
    },
    __mockRiderNotFound: () => {
      queryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    },
    __mockQueryError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
  }
})

vi.mock('react', () => ({
  cache: vi.fn((fn) => fn),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/chapter-config', () => ({
  getDbSlug: vi.fn((slug: string) => {
    const mapping: Record<string, string | null> = {
      toronto: 'toronto',
      'simcoe-muskoka': 'simcoe',
      ottawa: 'ottawa',
      huron: 'huron',
      permanent: null,
      pbp: 'toronto',
    }
    return mapping[slug] ?? null
  }),
  getUrlSlugFromDbSlug: vi.fn((slug: string) => {
    const mapping: Record<string, string> = {
      toronto: 'toronto',
      simcoe: 'simcoe-muskoka',
      ottawa: 'ottawa',
      huron: 'huron',
    }
    return mapping[slug] || slug
  }),
  getResultsChapterInfo: vi.fn((slug: string) => ({ name: 'Test Chapter', slug })),
  getAllResultsChapterSlugs: vi.fn(() => ['toronto', 'ottawa', 'simcoe-muskoka', 'huron']),
  getResultsDescription: vi.fn(() => 'Test description'),
}))

vi.mock('@/lib/utils', () => ({
  formatFinishTime: vi.fn((time: string | null) => time || null),
  formatStatus: vi.fn((status: string) => {
    if (status === 'dnf') return 'DNF'
    if (status === 'dns') return 'DNS'
    if (status === 'otl') return 'OTL'
    return null
  }),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
  logError: vi.fn(),
}))

// Import after mocks
import {
  getAvailableYears,
  getChapterResults,
  getRiderBySlug,
  getRiderResults,
} from '@/lib/data/results'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockEventsFound: (events: unknown[]) => void
  __mockRiderFound: (rider: unknown) => void
  __mockRiderNotFound: () => void
  __mockQueryError: (error: unknown) => void
}>('@/lib/supabase')

describe('getAvailableYears', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array for invalid chapter slug', async () => {
    const result = await getAvailableYears('invalid-chapter')

    expect(result).toEqual([])
  })

  it('returns empty array when no events found', async () => {
    mockModule.__mockEventsFound([])

    const result = await getAvailableYears('toronto')

    expect(result).toEqual([])
  })

  it('extracts unique seasons from events', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        season: 2025,
        results: [{ season: 2025 }],
      },
      {
        id: 'event-2',
        season: 2024,
        results: [{ season: 2024 }],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getAvailableYears('toronto')

    expect(result).toContain(2025)
    expect(result).toContain(2024)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('sorts years descending', async () => {
    const mockEvents = [
      { id: 'event-1', season: 2023, results: [] },
      { id: 'event-2', season: 2025, results: [] },
      { id: 'event-3', season: 2024, results: [] },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getAvailableYears('toronto')

    expect(result[0]).toBeGreaterThanOrEqual(result[1])
  })
})

describe('getChapterResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array for invalid chapter slug', async () => {
    const result = await getChapterResults('invalid-chapter', 2025)

    expect(result).toEqual([])
  })

  it('returns empty array when no events found', async () => {
    mockModule.__mockEventsFound([])

    const result = await getChapterResults('toronto', 2025)

    expect(result).toEqual([])
  })

  it('returns empty array for non-finite year without querying the database', async () => {
    // Regression: Sentry JAVASCRIPT-NEXTJS-25 — a bot hit /results/[year]/fleche,
    // parseInt("[year]") returned NaN, and `${NaN}-01-01` reached Postgres as an
    // invalid date literal. Guard at the data layer so callers can't trip the SQL.
    const result = await getChapterResults('fleche', Number.NaN)

    expect(result).toEqual([])
    expect(mockModule.__queryBuilder.gte).not.toHaveBeenCalled()
    expect(mockModule.__queryBuilder.lte).not.toHaveBeenCalled()
  })

  // Note: Full result transformation test requires multiple query mocking (events + awards).
  // This is complex to set up reliably. Full transformation is covered by E2E tests.

  it('filters by year range', async () => {
    mockModule.__mockEventsFound([])

    await getChapterResults('toronto', 2025)

    expect(mockModule.__queryBuilder.gte).toHaveBeenCalledWith('event_date', '2025-01-01')
    expect(mockModule.__queryBuilder.lte).toHaveBeenCalledWith('event_date', '2025-12-31')
  })

  it('orders events reverse chronologically (most recent first)', async () => {
    mockModule.__mockEventsFound([])

    await getChapterResults('toronto', 2025)

    expect(mockModule.__queryBuilder.order).toHaveBeenCalledWith('event_date', {
      ascending: false,
    })
  })

  it('throws on a persistent query error instead of caching an empty result', async () => {
    // Regression: Sentry JAVASCRIPT-NEXTJS-25. Returning [] here would let
    // unstable_cache persist an empty page after a transient Supabase 5xx.
    // The function must throw so the cache isn't poisoned and ISR serves stale.
    mockModule.__mockQueryError({
      message: 'Database error',
    })

    await expect(getChapterResults('toronto', 2025)).rejects.toThrow(/getChapterResults failed/)
  })

  it('retries a transient 5xx and returns data on recovery', async () => {
    // First attempt: Supabase gateway 500. Second attempt: success.
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'Internal server error.' }, status: 500 })
    )
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [
          {
            id: 'evt-1',
            name: 'Test Brevet',
            event_date: '2025-05-01',
            distance_km: 200,
            event_type: 'brevet',
            start_location: 'Toronto',
            routes: { slug: 'test-200' },
            chapters: { slug: 'toronto' },
            public_results: [
              {
                id: 'res-1',
                finish_time: '08:00',
                status: 'finished',
                team_name: null,
                distance_km: 200,
                rider_slug: 'jane-doe',
                first_name: 'Jane',
                last_name: 'Doe',
              },
            ],
          },
        ],
        error: null,
        status: 200,
      })
    )

    const result = await getChapterResults('toronto', 2025)

    expect(result).toHaveLength(1)
    expect(result[0].riders[0].name).toBe('Jane Doe')
  })

  it('throws when transient 5xx persists across all retries', async () => {
    mockModule.__queryBuilder.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'Internal server error.' }, status: 503 })
    )

    await expect(getChapterResults('toronto', 2025)).rejects.toThrow(/getChapterResults failed/)
  })

  it('includes routeChapterSlug from route chapters for permanent results', async () => {
    const mockEvents = [
      {
        id: 'perm-event-1',
        name: 'Frosty',
        event_date: '2025-03-11',
        distance_km: 200,
        event_type: 'permanent',
        start_location: 'Goderich',
        routes: { slug: 'frosty-200', chapters: { slug: 'huron' } },
        public_results: [
          {
            id: 'result-1',
            finish_time: '8:56',
            status: 'finished',
            team_name: null,
            distance_km: null,
            rider_slug: 'eric-darcy',
            first_name: 'Eric',
            last_name: "D'Arcy",
          },
        ],
      },
    ]

    // Mock events query
    mockModule.__mockEventsFound(mockEvents)
    // Mock awards query (empty)
    mockModule.__mockEventsFound([])

    const result = await getChapterResults('permanent', 2025)

    expect(result).toHaveLength(1)
    expect(result[0].routeSlug).toBe('frosty-200')
    expect(result[0].routeChapterSlug).toBe('huron')
  })

  it('returns null routeChapterSlug when route has no chapter', async () => {
    const mockEvents = [
      {
        id: 'perm-event-2',
        name: 'Some Route',
        event_date: '2025-04-01',
        distance_km: 200,
        event_type: 'permanent',
        start_location: null,
        routes: { slug: 'some-route-200', chapters: null },
        public_results: [
          {
            id: 'result-2',
            finish_time: '10:00',
            status: 'finished',
            team_name: null,
            distance_km: null,
            rider_slug: 'test-rider',
            first_name: 'Test',
            last_name: 'Rider',
          },
        ],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)
    mockModule.__mockEventsFound([])

    const result = await getChapterResults('permanent', 2025)

    expect(result).toHaveLength(1)
    expect(result[0].routeChapterSlug).toBeNull()
  })

  it('sets isCompletedDevilWeek true for riders with that award', async () => {
    const mockEvents = [
      {
        id: 'event-dw-1',
        name: 'Devil Week Brevet',
        event_date: '2025-07-01',
        distance_km: 200,
        event_type: 'brevet',
        start_location: null,
        routes: { slug: 'dw-route-200' },
        public_results: [
          {
            id: 'result-dw-1',
            finish_time: '10:00',
            status: 'finished',
            team_name: null,
            distance_km: null,
            rider_slug: 'jane-rider',
            first_name: 'Jane',
            last_name: 'Rider',
          },
          {
            id: 'result-dw-2',
            finish_time: '11:00',
            status: 'finished',
            team_name: null,
            distance_km: null,
            rider_slug: 'bob-norider',
            first_name: 'Bob',
            last_name: 'Norider',
          },
        ],
      },
    ]

    // Queue: events response
    mockModule.__mockEventsFound(mockEvents)
    // Queue: First Brevet awards (empty)
    mockModule.__mockEventsFound([])
    // Queue: Completed Devil Week awards (only result-dw-1)
    mockModule.__mockEventsFound([{ result_id: 'result-dw-1' }])

    const result = await getChapterResults('toronto', 2025)

    expect(result).toHaveLength(1)
    const janeRider = result[0].riders.find((r) => r.slug === 'jane-rider')
    const bobNorider = result[0].riders.find((r) => r.slug === 'bob-norider')
    expect(janeRider?.isCompletedDevilWeek).toBe(true)
    expect(bobNorider?.isCompletedDevilWeek).toBe(false)
  })

  it('converts db chapter slug to URL slug for routeChapterSlug', async () => {
    const mockEvents = [
      {
        id: 'perm-event-3',
        name: 'Some Simcoe Route',
        event_date: '2025-06-01',
        distance_km: 200,
        event_type: 'permanent',
        start_location: null,
        routes: { slug: 'simcoe-route-200', chapters: { slug: 'simcoe' } },
        public_results: [
          {
            id: 'result-3',
            finish_time: '9:00',
            status: 'finished',
            team_name: null,
            distance_km: null,
            rider_slug: 'test-rider',
            first_name: 'Test',
            last_name: 'Rider',
          },
        ],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)
    mockModule.__mockEventsFound([])

    const result = await getChapterResults('permanent', 2025)

    expect(result).toHaveLength(1)
    // 'simcoe' db slug should be converted to 'simcoe-muskoka' URL slug
    expect(result[0].routeChapterSlug).toBe('simcoe-muskoka')
  })
})

describe('getRiderBySlug', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns null when rider not found', async () => {
    mockModule.__mockRiderNotFound()

    const result = await getRiderBySlug('non-existent-rider')

    expect(result).toBeNull()
  })

  it('returns rider info correctly', async () => {
    const mockRider = {
      slug: 'john-doe',
      first_name: 'John',
      last_name: 'Doe',
      rider_number: null,
    }

    mockModule.__mockRiderFound(mockRider)

    const result = await getRiderBySlug('john-doe')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.slug).toBe('john-doe')
      expect(result.firstName).toBe('John')
      expect(result.lastName).toBe('Doe')
      expect(result.riderNumber).toBeNull()
    }
  })

  it('returns riderNumber when present', async () => {
    const mockRider = {
      slug: 'jane-smith',
      first_name: 'Jane',
      last_name: 'Smith',
      rider_number: 42,
    }

    mockModule.__mockRiderFound(mockRider)

    const result = await getRiderBySlug('jane-smith')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.riderNumber).toBe(42)
    }
  })

  it('returns null riderNumber when absent', async () => {
    const mockRider = {
      slug: 'new-rider',
      first_name: 'New',
      last_name: 'Rider',
      rider_number: null,
    }

    mockModule.__mockRiderFound(mockRider)

    const result = await getRiderBySlug('new-rider')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.riderNumber).toBeNull()
    }
  })
})

describe('getRiderResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when rider not found', async () => {
    mockModule.__mockRiderNotFound()

    const result = await getRiderResults('non-existent-rider')

    expect(result).toEqual([])
  })

  it('does not log an error when rider is simply not found', async () => {
    const { handleDataError } = await import('@/lib/errors')
    mockModule.__mockRiderNotFound()

    await getRiderResults('non-existent-rider')

    expect(handleDataError).not.toHaveBeenCalled()
  })

  it('groups results by year', async () => {
    const mockRider = {
      id: 'rider-1',
    }

    const mockResults = [
      {
        id: 'result-1',
        finish_time: '13:30',
        status: 'finished',
        note: null,
        season: 2025,
        events: {
          name: 'Spring 200',
          event_date: '2025-05-15',
          distance_km: 200,
          event_type: 'brevet',
          chapters: { slug: 'toronto' },
        },
        result_awards: [],
      },
      {
        id: 'result-2',
        finish_time: '14:00',
        status: 'finished',
        note: null,
        season: 2024,
        events: {
          name: 'Fall 200',
          event_date: '2024-10-15',
          distance_km: 200,
          event_type: 'brevet',
          chapters: { slug: 'toronto' },
        },
        result_awards: [],
      },
    ]

    mockModule.__mockRiderFound(mockRider)
    mockModule.__mockEventsFound(mockResults)

    const result = await getRiderResults('john-doe')

    expect(result).toHaveLength(2)
    expect(result[0].year).toBe(2025)
    expect(result[1].year).toBe(2024)
  })

  it('uses result distance_km for fleche events instead of event distance', async () => {
    const mockRider = { id: 'rider-1' }

    const mockResults = [
      {
        id: 'result-fleche',
        finish_time: null,
        status: 'finished',
        note: null,
        team_name: 'Gravelly Badgers',
        season: 2025,
        distance_km: 412,
        events: {
          name: 'Flèche',
          event_date: '2025-05-18',
          distance_km: 360,
          event_type: 'fleche',
          chapters: { slug: 'toronto' },
        },
        result_awards: [],
      },
    ]

    mockModule.__mockRiderFound(mockRider)
    mockModule.__mockEventsFound(mockResults)

    const result = await getRiderResults('fleche-rider')

    expect(result).toHaveLength(1)
    // Should use the result's distance (412), not the event's distance (360)
    expect(result[0].results[0].distanceKm).toBe(412)
    // Total distance should also use the result's distance
    expect(result[0].totalDistanceKm).toBe(412)
  })

  it('calculates completed count and total distance', async () => {
    const mockRider = {
      id: 'rider-1',
    }

    const mockResults = [
      {
        id: 'result-1',
        finish_time: '13:30',
        status: 'finished',
        note: null,
        season: 2025,
        events: {
          name: 'Spring 200',
          event_date: '2025-05-15',
          distance_km: 200,
          event_type: 'brevet',
          chapters: { slug: 'toronto' },
        },
        result_awards: [],
      },
      {
        id: 'result-2',
        finish_time: null,
        status: 'dnf',
        note: null,
        season: 2025,
        events: {
          name: 'Fall 300',
          event_date: '2025-10-15',
          distance_km: 300,
          event_type: 'brevet',
          chapters: { slug: 'toronto' },
        },
        result_awards: [],
      },
    ]

    mockModule.__mockRiderFound(mockRider)
    mockModule.__mockEventsFound(mockResults)

    const result = await getRiderResults('john-doe')

    expect(result[0].completedCount).toBe(1)
    expect(result[0].totalDistanceKm).toBe(200)
  })
})
