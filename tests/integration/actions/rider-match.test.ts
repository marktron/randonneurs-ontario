import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for rider matching actions.
 *
 * These tests focus on:
 * 1. Name variant generation
 * 2. Fuzzy matching logic
 * 3. Empty input handling
 * 4. Error handling
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
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
      'is',
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
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
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

vi.mock('@/lib/utils/fuzzy-match', () => ({
  findFuzzyNameMatches: vi.fn((firstName, lastName, riders, getFirst, getLast, options) => {
    // Simple mock that returns first few riders as matches
    return riders.slice(0, options.maxResults || 10).map((rider: unknown, index: number) => ({
      item: rider,
      score: 1 - index * 0.1,
    }))
  }),
  getNameVariants: vi.fn((name) => {
    // Simple mock that returns name variants
    const lower = name.toLowerCase()
    const variants = [lower]
    if (lower === 'bob') variants.push('robert', 'bobby')
    if (lower === 'dave') variants.push('david')
    return variants
  }),
}))

// Import after mocks
import { searchRiderCandidates } from '@/lib/actions/rider-match'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRidersFound: (riders: unknown[]) => void
  __mockRidersEmpty: () => void
  __mockQueryError: (error: unknown) => void
}>('@/lib/supabase-server')

describe('searchRiderCandidates', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('input validation', () => {
    it('returns empty candidates for empty input', async () => {
      const result = await searchRiderCandidates('', '')

      expect(result.candidates).toEqual([])
    })

    it('returns empty candidates for whitespace-only input', async () => {
      const result = await searchRiderCandidates('   ', '   ')

      expect(result.candidates).toEqual([])
    })

    it('handles trimmed input', async () => {
      mockModule.__mockRidersEmpty()

      const result = await searchRiderCandidates('  John  ', '  Doe  ')

      // Should not error, should query with trimmed values
      expect(result.candidates).toEqual([])
    })
  })

  describe('query behavior', () => {
    it('searches for riders without email', async () => {
      mockModule.__mockRidersEmpty()

      await searchRiderCandidates('John', 'Doe')

      // Verify query was made (indirectly through mock)
      expect(mockModule.__queryBuilder.is).toHaveBeenCalled()
    })

    it('limits results to 100 riders', async () => {
      mockModule.__mockRidersEmpty()

      await searchRiderCandidates('John', 'Doe')

      // Verify limit was applied
      expect(mockModule.__queryBuilder.limit).toHaveBeenCalledWith(100)
    })

    it('handles query errors gracefully', async () => {
      mockModule.__mockQueryError({
        message: 'Database error',
      })

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates).toEqual([])
    })
  })

  describe('results processing', () => {
    it('returns empty array when no riders found', async () => {
      mockModule.__mockRidersEmpty()

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates).toEqual([])
    })

    it('processes riders with results', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: 'John Doe',
          results: [
            { rider_id: 'rider-1', season: 2020 },
            { rider_id: 'rider-1', season: 2021 },
          ],
        },
        {
          id: 'rider-2',
          first_name: 'Jane',
          last_name: 'Smith',
          full_name: null,
          results: [{ rider_id: 'rider-2', season: 2022 }],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates.length).toBeGreaterThan(0)
      expect(result.candidates[0].id).toBe('rider-1')
      expect(result.candidates[0].firstName).toBe('John')
      expect(result.candidates[0].lastName).toBe('Doe')
    })

    it('calculates first season correctly', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: null,
          results: [
            { rider_id: 'rider-1', season: 2021 },
            { rider_id: 'rider-1', season: 2020 },
            { rider_id: 'rider-1', season: 2022 },
          ],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].firstSeason).toBe(2020)
    })

    it('calculates total rides correctly', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: null,
          results: [
            { rider_id: 'rider-1', season: 2020 },
            { rider_id: 'rider-1', season: 2021 },
            { rider_id: 'rider-1', season: 2022 },
          ],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].totalRides).toBe(3)
    })

    it('handles riders with no results', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: null,
          results: null,
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].totalRides).toBe(0)
      expect(result.candidates[0].firstSeason).toBeNull()
    })

    it('uses full_name when available', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: 'Johnny Doe',
          results: [],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].fullName).toBe('Johnny Doe')
    })

    it('constructs full name when full_name is null', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: null,
          results: [],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].fullName).toBe('John Doe')
    })
  })

  describe('fuzzy matching', () => {
    it('applies fuzzy matching to results', async () => {
      const mockRiders = [
        {
          id: 'rider-1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: null,
          results: [],
        },
        {
          id: 'rider-2',
          first_name: 'Jane',
          last_name: 'Smith',
          full_name: null,
          results: [],
        },
      ]

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      // Should be limited by maxResults (10)
      expect(result.candidates.length).toBeLessThanOrEqual(10)
    })

    it('limits results to maxResults', async () => {
      const mockRiders = Array.from({ length: 20 }, (_, i) => ({
        id: `rider-${i}`,
        first_name: 'John',
        last_name: 'Doe',
        full_name: null,
        results: [],
      }))

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      // Should be limited to 10 (maxResults default)
      expect(result.candidates.length).toBeLessThanOrEqual(10)
    })
  })
})
