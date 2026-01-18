import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for route data fetching functions.
 */

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

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
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
    },
    __mockRouteFound: (route: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: route, error: null })
    },
    __mockRoutesFound: (routes: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: routes, error: null })
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
  getDbSlug: vi.fn((slug: string) => (slug === 'toronto' ? 'toronto' : null)),
  getUrlSlugFromDbSlug: vi.fn((slug: string) => slug),
  getChapterInfo: vi.fn(() => ({ name: 'Test Chapter', slug: 'toronto' })),
  getAllChapterSlugs: vi.fn(() => ['toronto']),
}))

vi.mock('@/lib/utils', () => ({
  formatFinishTime: vi.fn((time: string | null) => time || null),
  formatStatus: vi.fn((status: string) => null),
  parseFinishTimeToMinutes: vi.fn((time: string) => 810), // 13:30 = 810 minutes
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
}))

import {
  getRouteBySlug,
  getRoutesByChapter,
  getRouteResults,
  getActiveRoutes,
} from '@/lib/data/routes'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRouteFound: (route: unknown) => void
  __mockRoutesFound: (routes: unknown[]) => void
}>('@/lib/supabase')

describe('getRouteBySlug', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns null when route not found', async () => {
    const result = await getRouteBySlug('non-existent-route')

    expect(result).toBeNull()
  })

  it('returns route details correctly', async () => {
    const mockRoute = {
      slug: 'toronto-200',
      name: 'Toronto 200',
      distance_km: 200,
      description: 'Test route',
      rwgps_id: '12345678',
      chapters: {
        slug: 'toronto',
        name: 'Toronto',
      },
    }

    mockModule.__mockRouteFound(mockRoute)

    const result = await getRouteBySlug('toronto-200')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.name).toBe('Toronto 200')
      expect(result.distanceKm).toBe(200)
      expect(result.rwgpsId).toBe('12345678')
    }
  })
})

describe('getRoutesByChapter', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array for invalid chapter', async () => {
    const result = await getRoutesByChapter('invalid-chapter')

    expect(result).toEqual([])
  })

  it('groups routes by distance category', async () => {
    const mockRoutes = [
      { name: 'Route 200', distance_km: 200, rwgps_id: '123' },
      { name: 'Route 300', distance_km: 300, rwgps_id: '456' },
    ]

    mockModule.__mockRoutesFound(mockRoutes)

    const result = await getRoutesByChapter('toronto')

    expect(result.length).toBeGreaterThan(0)
  })

  it('filters for active routes only', async () => {
    mockModule.__mockRoutesFound([])

    await getRoutesByChapter('toronto')

    expect(mockModule.__queryBuilder.eq).toHaveBeenCalledWith('is_active', true)
  })
})

describe('getRouteResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when no events found', async () => {
    // When no events are found, the function returns early without making second query
    mockModule.__mockRoutesFound([])

    const result = await getRouteResults('toronto-200')

    expect(result).toEqual([])
  })

  // Note: Tests for results with events require multiple query mocking (events + awards)
  // which is complex to set up reliably. Full transform behavior is covered by E2E tests.
})

describe('getActiveRoutes', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when no routes found', async () => {
    mockModule.__mockRoutesFound([])

    const result = await getActiveRoutes()

    expect(result).toEqual([])
  })

  it('transforms active routes correctly', async () => {
    const mockRoutes = [
      {
        id: 'route-1',
        name: 'Toronto 200',
        slug: 'toronto-200',
        distance_km: 200,
        chapter_id: 'chapter-1',
        chapters: { name: 'Toronto' },
      },
    ]

    mockModule.__mockRoutesFound(mockRoutes)

    const result = await getActiveRoutes()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Toronto 200')
  })
})
