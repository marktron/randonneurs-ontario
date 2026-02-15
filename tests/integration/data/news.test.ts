import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for news data fetching functions.
 *
 * These tests focus on:
 * 1. Successful data retrieval
 * 2. Empty state handling
 * 3. Error handling with graceful degradation
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
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
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    },
    __mockNewsFound: (items: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: items, error: null })
      })
    },
    __mockNewsError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
  }
})

// Mock supabase-server for admin queries (getAllNews, getNewsItem)
vi.mock('@/lib/supabase-server', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = ['select', 'eq', 'order', 'single']

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
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
    __adminQueryBuilder: queryBuilder,
    __resetAdmin: () => {
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    },
    __mockAdminNewsFound: (items: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: items, error: null })
      })
    },
    __mockAdminSingleFound: (item: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: item, error: null })
    },
  }
})

vi.mock('react', () => ({
  cache: vi.fn((fn) => fn),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
}))

// Import after mocks
import { getPublishedNews, getAllNews, getNewsItem } from '@/lib/data/news'

const publicMock = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockNewsFound: (items: unknown[]) => void
  __mockNewsError: (error: unknown) => void
}>('@/lib/supabase')

const adminMock = await vi.importMock<{
  __adminQueryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __resetAdmin: () => void
  __mockAdminNewsFound: (items: unknown[]) => void
  __mockAdminSingleFound: (item: unknown) => void
}>('@/lib/supabase-server')

const sampleNewsItems = [
  {
    id: 'news-1',
    title: 'First News',
    body: 'Body of first news item.',
    is_published: true,
    sort_order: 0,
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
  },
  {
    id: 'news-2',
    title: 'Second News',
    body: 'Body of second news item.',
    is_published: true,
    sort_order: 1,
    created_at: '2025-01-14T10:00:00Z',
    updated_at: '2025-01-14T10:00:00Z',
  },
]

describe('getPublishedNews', () => {
  beforeEach(() => {
    publicMock.__reset()
    vi.clearAllMocks()
  })

  it('returns published news items when found', async () => {
    publicMock.__mockNewsFound(sampleNewsItems)

    const result = await getPublishedNews()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('news-1')
    expect(result[1].id).toBe('news-2')
  })

  it('returns empty array when no items found', async () => {
    // Default mock returns empty array
    const result = await getPublishedNews()

    expect(result).toEqual([])
  })

  it('returns empty array on error', async () => {
    publicMock.__mockNewsError({ message: 'Database error' })

    const result = await getPublishedNews()

    expect(result).toEqual([])
  })
})

describe('getAllNews', () => {
  beforeEach(() => {
    adminMock.__resetAdmin()
    vi.clearAllMocks()
  })

  it('returns all news items', async () => {
    adminMock.__mockAdminNewsFound(sampleNewsItems)

    const result = await getAllNews()

    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('First News')
    expect(result[1].title).toBe('Second News')
  })

  it('returns empty array on error', async () => {
    adminMock.__adminQueryBuilder.then.mockImplementationOnce(
      (resolve: (value: unknown) => void) => {
        resolve({ data: null, error: { message: 'Database error' } })
      }
    )

    const result = await getAllNews()

    expect(result).toEqual([])
  })
})

describe('getNewsItem', () => {
  beforeEach(() => {
    adminMock.__resetAdmin()
    vi.clearAllMocks()
  })

  it('returns news item when found', async () => {
    adminMock.__mockAdminSingleFound(sampleNewsItems[0])

    const result = await getNewsItem('news-1')

    expect(result).not.toBeNull()
    if (result) {
      expect(result.id).toBe('news-1')
      expect(result.title).toBe('First News')
    }
  })

  it('returns null when not found', async () => {
    // Default mock returns PGRST116 error for single()
    const result = await getNewsItem('non-existent-id')

    expect(result).toBeNull()
  })
})
