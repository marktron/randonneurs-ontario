import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for rider actions.
 *
 * Note: Full database operation tests are covered in E2E tests because
 * Supabase's chainable query builder is complex to mock accurately.
 * These tests focus on input validation logic.
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
      'ilike',
      'order',
      'limit',
      'range',
      'insert',
      'update',
      'delete',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
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
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
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
    __mockRiderFound: (rider: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: rider, error: null })
    },
    __mockRiderNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockInsertSuccess: (data: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data, error: null })
    },
    __mockInsertError: (error: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error })
    },
    __mockQueryError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
  }),
}))

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/utils/rider-search', () => ({
  applyRiderSearchFilter: vi.fn((query) => query),
}))

// Import after mocking
import { searchRiders, createRider, mergeRiders, getRiderCounts } from '@/lib/actions/riders'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRidersFound: (riders: unknown[]) => void
  __mockRiderFound: (rider: unknown) => void
  __mockRiderNotFound: () => void
  __mockInsertSuccess: (data: unknown) => void
  __mockInsertError: (error: unknown) => void
  __mockQueryError: (error: unknown) => void
}>('@/lib/supabase-server')

describe('searchRiders', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns empty array for query less than 2 characters', async () => {
    const result = await searchRiders('J')

    expect(result).toEqual([])
  })

  it('returns empty array for empty query', async () => {
    const result = await searchRiders('')

    expect(result).toEqual([])
  })

  it('returns riders matching the query', async () => {
    const mockRiders = [
      { id: 'rider-1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
      { id: 'rider-2', first_name: 'Jane', last_name: 'Smith', email: null },
    ]

    mockModule.__mockRidersFound(mockRiders)

    const result = await searchRiders('John')

    expect(result).toHaveLength(2)
    expect(result[0].first_name).toBe('John')
  })

  it('handles query errors gracefully', async () => {
    mockModule.__mockQueryError({ message: 'Database error' })

    const result = await searchRiders('John')

    expect(result).toEqual([])
  })
})

describe('createRider', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when firstName is missing', async () => {
      const result = await createRider({
        firstName: '',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('First name and last name are required')
    })

    it('returns error when lastName is missing', async () => {
      const result = await createRider({
        firstName: 'John',
        lastName: '',
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('First name and last name are required')
    })
  })

  describe('duplicate email check', () => {
    it('returns error when email already exists', async () => {
      mockModule.__mockRiderFound({ id: 'existing-rider' })

      const result = await createRider({
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('A rider with this email already exists')
    })
  })

  describe('successful creation', () => {
    it('creates rider successfully without email', async () => {
      // No email check needed when email is not provided
      mockModule.__mockInsertSuccess({ id: 'new-rider-id' })

      const result = await createRider({
        firstName: 'John',
        lastName: 'Doe',
      })

      expect(result.success).toBe(true)
      expect(result.riderId).toBe('new-rider-id')
    })

    it('creates rider successfully with email', async () => {
      // First check: email doesn't exist
      mockModule.__mockRiderNotFound()
      // Second: insert succeeds
      mockModule.__mockInsertSuccess({ id: 'new-rider-id' })

      const result = await createRider({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(true)
      expect(result.riderId).toBe('new-rider-id')
    })
  })

  describe('error handling', () => {
    it('handles database errors', async () => {
      // No email check when email not provided, goes directly to insert
      mockModule.__mockInsertError({ code: '23505', message: 'duplicate key' })

      const result = await createRider({
        firstName: 'John',
        lastName: 'Doe',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('getRiderCounts', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns counts for riders', async () => {
    // Mock registrations
    mockModule.__mockRidersFound([
      { rider_id: 'rider-1' },
      { rider_id: 'rider-1' },
      { rider_id: 'rider-2' },
    ])
    // Mock results
    mockModule.__mockRidersFound([{ rider_id: 'rider-1' }])

    const result = await getRiderCounts(['rider-1', 'rider-2'])

    expect(result['rider-1'].registrations).toBe(2)
    expect(result['rider-1'].results).toBe(1)
    expect(result['rider-2'].registrations).toBe(1)
    expect(result['rider-2'].results).toBe(0)
  })

  it('returns zero counts for riders with no data', async () => {
    mockModule.__mockRidersFound([])
    mockModule.__mockRidersFound([])

    const result = await getRiderCounts(['rider-1', 'rider-2'])

    expect(result['rider-1'].registrations).toBe(0)
    expect(result['rider-1'].results).toBe(0)
    expect(result['rider-2'].registrations).toBe(0)
    expect(result['rider-2'].results).toBe(0)
  })
})

describe('mergeRiders', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when less than 2 riders are provided', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-1',
        sourceRiderIds: ['rider-1'], // Only 1 rider
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: null,
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('At least 2 riders are required to merge')
    })

    it('returns error when target rider is not in source list', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-3', // Not in sourceRiderIds
        sourceRiderIds: ['rider-1', 'rider-2'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: null,
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Target rider must be one of the selected riders')
    })

    it('accepts valid merge with 2 riders', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-1',
        sourceRiderIds: ['rider-1', 'rider-2'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: 'M',
        },
      })

      // The mock setup may not fully support the chain, but validation passes
      // Full success path is tested in E2E
      expect(result.success).toBe(true)
    })

    it('accepts valid merge with 3 riders', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-2',
        sourceRiderIds: ['rider-1', 'rider-2', 'rider-3'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: 'F',
        },
      })

      expect(result.success).toBe(true)
    })
  })
})
