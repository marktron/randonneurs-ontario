import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for event data fetching functions.
 *
 * These tests focus on:
 * 1. Data transformation
 * 2. Error handling with graceful degradation
 * 3. Empty state handling
 * 4. Query building logic
 */

// Mock dependencies before imports
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
  // Shared RPC mock - created once and reused
  const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })

  return {
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      rpc: rpcMock,
    })),
    __queryBuilder: queryBuilder,
    __rpcMock: rpcMock,
    __reset: () => {
      // Use mockReset to clear implementation queue, then set default
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      rpcMock.mockReset()
      rpcMock.mockResolvedValue({ data: [], error: null })
    },
    __mockEventsFound: (events: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: events, error: null })
      })
    },
    __mockEventsEmpty: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: [], error: null })
      })
    },
    __mockEventFound: (event: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: event, error: null })
    },
    __mockEventNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockQueryError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
    __mockRpcResponse: (data: unknown) => {
      rpcMock.mockResolvedValueOnce({ data, error: null })
    },
    __mockRpcError: (error: unknown) => {
      rpcMock.mockResolvedValueOnce({ data: null, error })
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
    const mapping: Record<string, string> = {
      toronto: 'toronto',
      'simcoe-muskoka': 'simcoe',
      ottawa: 'ottawa',
      huron: 'huron',
    }
    return mapping[slug] || null
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
  getChapterInfo: vi.fn((slug: string) => ({ name: 'Test Chapter', slug })),
  getAllChapterSlugs: vi.fn(() => ['toronto', 'ottawa', 'simcoe-muskoka', 'huron']),
}))

vi.mock('@/lib/utils', () => ({
  formatEventType: vi.fn((type: string) => {
    const mapping: Record<string, string> = {
      brevet: 'Brevet',
      populaire: 'Populaire',
      fleche: 'Fleche',
      permanent: 'Permanent',
    }
    return mapping[type] || type
  }),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
}))

// Import after mocks
import {
  getEventsByChapter,
  getPermanentEvents,
  getEventBySlug,
  getRegisteredRiders,
} from '@/lib/data/events'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __rpcMock: ReturnType<typeof vi.fn>
  __reset: () => void
  __mockEventsFound: (events: unknown[]) => void
  __mockEventsEmpty: () => void
  __mockEventFound: (event: unknown) => void
  __mockEventNotFound: () => void
  __mockQueryError: (error: unknown) => void
  __mockRpcResponse: (data: unknown) => void
  __mockRpcError: (error: unknown) => void
}>('@/lib/supabase')

describe('getEventsByChapter', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array for invalid chapter slug', async () => {
    const result = await getEventsByChapter('invalid-chapter')

    expect(result).toEqual([])
  })

  it('returns empty array when no events found', async () => {
    mockModule.__mockEventsEmpty()

    const result = await getEventsByChapter('toronto')

    expect(result).toEqual([])
  })

  it('transforms events correctly', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        slug: 'spring-200-2025',
        event_date: '2025-05-15',
        name: 'Spring 200',
        event_type: 'brevet',
        distance_km: 200,
        start_location: 'Toronto',
        start_time: '08:00',
        registrations: [{ count: 5 }],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getEventsByChapter('toronto')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('event-1')
    expect(result[0].name).toBe('Spring 200')
    expect(result[0].type).toBe('Brevet')
    expect(result[0].distance).toBe('200')
    expect(result[0].registeredCount).toBe(5)
  })

  it('handles missing optional fields', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        slug: 'spring-200-2025',
        event_date: '2025-05-15',
        name: 'Spring 200',
        event_type: 'brevet',
        distance_km: 200,
        start_location: null,
        start_time: null,
        registrations: [],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getEventsByChapter('toronto')

    expect(result[0].startLocation).toBe('')
    expect(result[0].startTime).toBe('08:00')
    expect(result[0].registeredCount).toBe(0)
  })

  it('handles query errors gracefully', async () => {
    mockModule.__mockQueryError({
      message: 'Database error',
    })

    const result = await getEventsByChapter('toronto')

    expect(result).toEqual([])
  })

  it('filters for scheduled events only', async () => {
    mockModule.__mockEventsEmpty()

    await getEventsByChapter('toronto')

    // Verify query filters
    expect(mockModule.__queryBuilder.eq).toHaveBeenCalledWith('status', 'scheduled')
  })

  it('excludes permanent events', async () => {
    mockModule.__mockEventsEmpty()

    await getEventsByChapter('toronto')

    // Verify permanent events are excluded
    expect(mockModule.__queryBuilder.neq).toHaveBeenCalledWith('event_type', 'permanent')
  })
})

describe('getPermanentEvents', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when no permanent events found', async () => {
    mockModule.__mockEventsEmpty()

    const result = await getPermanentEvents()

    expect(result).toEqual([])
  })

  it('transforms permanent events correctly', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        slug: 'permanent-200',
        event_date: '2025-06-01',
        name: 'Permanent 200',
        event_type: 'permanent',
        distance_km: 200,
        start_location: 'Toronto',
        start_time: '09:00',
        registrations: [{ count: 2 }],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getPermanentEvents()

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('Permanent')
  })

  it('filters for permanent event type', async () => {
    mockModule.__mockEventsEmpty()

    await getPermanentEvents()

    expect(mockModule.__queryBuilder.eq).toHaveBeenCalledWith('event_type', 'permanent')
  })
})

describe('getEventBySlug', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns null when event not found', async () => {
    mockModule.__mockEventNotFound()

    const result = await getEventBySlug('non-existent-event')

    expect(result).toBeNull()
  })

  it('returns event details with relations', async () => {
    const mockEvent = {
      id: 'event-1',
      slug: 'spring-200-2025',
      name: 'Spring 200',
      event_date: '2025-05-15',
      start_time: '08:00',
      start_location: 'Toronto',
      distance_km: 200,
      event_type: 'brevet',
      description: 'Test description',
      image_url: 'https://example.com/image.jpg',
      chapters: {
        name: 'Toronto',
        slug: 'toronto',
      },
      routes: {
        slug: 'toronto-200',
        rwgps_id: '12345678',
        cue_sheet_url: 'https://example.com/cue.pdf',
      },
    }

    mockModule.__mockEventFound(mockEvent)

    const result = await getEventBySlug('spring-200-2025')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.name).toBe('Spring 200')
      expect(result.chapterName).toBe('Toronto')
      expect(result.rwgpsId).toBe('12345678')
      expect(result.routeSlug).toBe('toronto-200')
    }
  })

  it('handles missing optional relations', async () => {
    const mockEvent = {
      id: 'event-1',
      slug: 'spring-200-2025',
      name: 'Spring 200',
      event_date: '2025-05-15',
      start_time: null,
      start_location: null,
      distance_km: 200,
      event_type: 'brevet',
      description: null,
      image_url: null,
      chapters: null,
      routes: null,
    }

    mockModule.__mockEventFound(mockEvent)

    const result = await getEventBySlug('spring-200-2025')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.startTime).toBe('08:00')
      expect(result.startLocation).toBe('')
      expect(result.rwgpsId).toBeNull()
      expect(result.routeSlug).toBeNull()
    }
  })
})

describe('getRegisteredRiders', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when no riders registered', async () => {
    mockModule.__mockRpcResponse([])

    const result = await getRegisteredRiders('event-1')

    expect(result).toEqual([])
  })

  it('transforms registered riders correctly', async () => {
    const mockRiders = [
      {
        first_name: 'John',
        last_name: 'Doe',
        share_registration: true,
      },
      {
        first_name: 'Jane',
        last_name: 'Smith',
        share_registration: false,
      },
    ]

    mockModule.__mockRpcResponse(mockRiders)

    const result = await getRegisteredRiders('event-1')

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('John D.')
    expect(result[1].name).toBe('Anonymous')
  })

  it('handles RPC errors gracefully', async () => {
    mockModule.__mockRpcError({ message: 'RPC error' })

    const result = await getRegisteredRiders('event-1')

    expect(result).toEqual([])
  })
})
