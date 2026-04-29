import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for rider matching actions.
 *
 * These tests focus on:
 * 1. Name variant generation
 * 2. Fuzzy matching logic
 * 3. Empty input handling
 * 4. Error handling
 * 5. Email obfuscation
 * 6. Filtering out riders whose email matches the registration email
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
import { getNameVariants } from '@/lib/utils/fuzzy-match'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRidersFound: (riders: unknown[]) => void
  __mockRidersEmpty: () => void
  __mockQueryError: (error: unknown) => void
}>('@/lib/supabase-server')

function mockRider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rider-1',
    first_name: 'John',
    last_name: 'Doe',
    full_name: null,
    email: null,
    member_since: null,
    results: [{ count: 0 }],
    ...overrides,
  }
}

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

    it('short-circuits without querying when getNameVariants returns no variants', async () => {
      // When the first name is composed entirely of stripped characters
      // (e.g. PostgREST operator chars), getNameVariants returns []. The
      // action must not fall through to `.or('')` against the riders table.
      vi.mocked(getNameVariants).mockReturnValueOnce([])

      const result = await searchRiderCandidates(',,,', 'Smith')

      expect(result.candidates).toEqual([])
      expect(mockModule.__queryBuilder.or).not.toHaveBeenCalled()
    })
  })

  describe('query behavior', () => {
    it('searches all riders including those with email', async () => {
      mockModule.__mockRidersEmpty()

      await searchRiderCandidates('John', 'Doe')

      // Should NOT filter by email IS NULL
      expect(mockModule.__queryBuilder.is).not.toHaveBeenCalled()
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
      mockModule.__mockRidersFound([
        mockRider({
          results: [{ count: 2 }],
        }),
        mockRider({
          id: 'rider-2',
          first_name: 'Jane',
          last_name: 'Smith',
          results: [{ count: 1 }],
        }),
      ])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates.length).toBeGreaterThan(0)
      expect(result.candidates[0].id).toBe('rider-1')
      expect(result.candidates[0].firstName).toBe('John')
      expect(result.candidates[0].lastName).toBe('Doe')
    })

    it('uses member_since for firstSeason', async () => {
      mockModule.__mockRidersFound([mockRider({ member_since: 2018 })])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].firstSeason).toBe(2018)
    })

    it('calculates total rides from results count', async () => {
      mockModule.__mockRidersFound([
        mockRider({
          results: [{ count: 3 }],
        }),
      ])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].totalRides).toBe(3)
    })

    it('handles riders with no results', async () => {
      mockModule.__mockRidersFound([mockRider({ results: null })])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].totalRides).toBe(0)
      expect(result.candidates[0].firstSeason).toBeNull()
    })

    it('uses full_name when available', async () => {
      mockModule.__mockRidersFound([mockRider({ full_name: 'Johnny Doe' })])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].fullName).toBe('Johnny Doe')
    })

    it('constructs full name when full_name is null', async () => {
      mockModule.__mockRidersFound([mockRider()])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].fullName).toBe('John Doe')
    })
  })

  describe('email handling', () => {
    it('excludes riders whose email matches the registration email', async () => {
      mockModule.__mockRidersFound([
        mockRider({ id: 'rider-1', email: 'john@example.com' }),
        mockRider({ id: 'rider-2', first_name: 'Jon', email: 'jon@other.com' }),
      ])

      const result = await searchRiderCandidates('John', 'Doe', 'john@example.com')

      // rider-1 should be excluded since their email matches the registration email
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].id).toBe('rider-2')
    })

    it('excludes email match case-insensitively', async () => {
      mockModule.__mockRidersFound([mockRider({ email: 'John@Example.COM' })])

      const result = await searchRiderCandidates('John', 'Doe', 'john@example.com')

      expect(result.candidates).toHaveLength(0)
    })

    it('includes all riders when no registration email provided', async () => {
      mockModule.__mockRidersFound([
        mockRider({ id: 'rider-1', email: 'john@example.com' }),
        mockRider({ id: 'rider-2', email: null }),
      ])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates).toHaveLength(2)
    })

    it('obfuscates email in candidates', async () => {
      mockModule.__mockRidersFound([mockRider({ email: 'markallen@gmail.com' })])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].obfuscatedEmail).toBe('m•••••••n@gmail.com')
    })

    it('obfuscates short emails', async () => {
      mockModule.__mockRidersFound([mockRider({ email: 'jo@example.com' })])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].obfuscatedEmail).toBe('j•@example.com')
    })

    it('returns null obfuscatedEmail for riders without email', async () => {
      mockModule.__mockRidersFound([mockRider()])

      const result = await searchRiderCandidates('John', 'Doe')

      expect(result.candidates[0].obfuscatedEmail).toBeNull()
    })
  })

  describe('fuzzy matching', () => {
    it('applies fuzzy matching to results', async () => {
      mockModule.__mockRidersFound([
        mockRider({ id: 'rider-1' }),
        mockRider({ id: 'rider-2', first_name: 'Jane', last_name: 'Smith' }),
      ])

      const result = await searchRiderCandidates('John', 'Doe')

      // Should be limited by maxResults (10)
      expect(result.candidates.length).toBeLessThanOrEqual(10)
    })

    it('limits results to maxResults', async () => {
      const mockRiders = Array.from({ length: 20 }, (_, i) => mockRider({ id: `rider-${i}` }))

      mockModule.__mockRidersFound(mockRiders)

      const result = await searchRiderCandidates('John', 'Doe')

      // Should be limited to 10 (maxResults default)
      expect(result.candidates.length).toBeLessThanOrEqual(10)
    })
  })
})
