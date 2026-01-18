import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for riders data fetching functions.
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
    },
    __mockRidersFound: (riders: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: riders, error: null })
      })
    },
    __mockRidersEmpty: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: [], error: null })
      })
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

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
}))

import { getAllRiders } from '@/lib/data/riders'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRidersFound: (riders: unknown[]) => void
  __mockRidersEmpty: () => void
  __mockQueryError: (error: unknown) => void
}>('@/lib/supabase')

describe('getAllRiders', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array when no riders found', async () => {
    mockModule.__mockRidersEmpty()

    const result = await getAllRiders()

    expect(result).toEqual([])
  })

  it('transforms riders correctly', async () => {
    const mockRiders = [
      {
        slug: 'john-doe',
        first_name: 'John',
        last_name: 'Doe',
      },
      {
        slug: 'jane-smith',
        first_name: 'Jane',
        last_name: 'Smith',
      },
    ]

    mockModule.__mockRidersFound(mockRiders)

    const result = await getAllRiders()

    expect(result).toHaveLength(2)
    expect(result[0].slug).toBe('john-doe')
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
  })

  it('handles pagination for large datasets', async () => {
    // First batch
    const batch1 = Array.from({ length: 1000 }, (_, i) => ({
      slug: `rider-${i}`,
      first_name: 'First',
      last_name: `Last${i}`,
    }))

    // Second batch (smaller)
    const batch2 = Array.from({ length: 500 }, (_, i) => ({
      slug: `rider-${i + 1000}`,
      first_name: 'First',
      last_name: `Last${i + 1000}`,
    }))

    mockModule.__mockRidersFound(batch1)
    mockModule.__mockRidersFound(batch2)

    const result = await getAllRiders()

    expect(result.length).toBe(1500)
  })

  it('handles query errors gracefully', async () => {
    mockModule.__mockQueryError({
      message: 'Database error',
    })

    const result = await getAllRiders()

    expect(result).toEqual([])
  })

  it('requests sorted data from database', async () => {
    // The function uses .order() to request sorted data from Supabase
    // We provide already-sorted mock data to simulate the DB response
    const mockRiders = [
      { slug: 'rider-2', first_name: 'Jane', last_name: 'Anderson' },
      { slug: 'rider-3', first_name: 'Bob', last_name: 'Smith' },
      { slug: 'rider-1', first_name: 'John', last_name: 'Smith' },
    ]

    mockModule.__mockRidersFound(mockRiders)

    const result = await getAllRiders()

    // Verify order is preserved from mock (DB sorts it)
    expect(result[0].lastName).toBe('Anderson')
    expect(result[1].lastName).toBe('Smith')
    // Verify the .order() method was called
    expect(mockModule.__queryBuilder.order).toHaveBeenCalledWith('last_name', { ascending: true })
  })
})
