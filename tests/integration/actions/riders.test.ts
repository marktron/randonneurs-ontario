import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidateTag } from 'next/cache'

/**
 * Integration tests for rider actions.
 *
 * Note: Full database operation tests are covered in E2E tests because
 * Supabase's chainable query builder is complex to mock accurately.
 * These tests focus on input validation logic.
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  // Track all requests for assertions
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []
  let currentTable = ''

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
      builder[method] = vi.fn((...args) => {
        calls.push({ table: currentTable, method, args })
        return builder
      })
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
      from: vi.fn((table: string) => {
        currentTable = table
        return queryBuilder
      }),
    })),
    __calls: calls,
    __queryBuilder: queryBuilder,
    __reset: () => {
      calls.length = 0
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
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/utils/rider-search', () => ({
  applyRiderSearchFilter: vi.fn((query) => query),
}))

// Import after mocking
import {
  searchRiders,
  createRider,
  updateRider,
  mergeRiders,
  getRiderCounts,
} from '@/lib/actions/riders'

const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
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
      // createRider now uses .ilike(...).limit(1), which resolves to a list
      mockModule.__mockRidersFound([{ id: 'existing-rider' }])

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

      // Verify insert was called on the riders table
      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
      const insertData = insertCalls[0].args![0] as Record<string, unknown>
      expect(insertData.first_name).toBe('John')
      expect(insertData.last_name).toBe('Doe')
      expect(insertData.slug).toBe('john-doe')
    })

    it('retries with numeric suffix on slug collision', async () => {
      // First attempt: slug collision (23505)
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "riders_slug_key"',
        details: '',
      })
      // Second attempt: success with slug "john-doe-2"
      mockModule.__mockInsertSuccess({ id: 'new-rider-id' })

      const result = await createRider({ firstName: 'John', lastName: 'Doe' })

      expect(result.success).toBe(true)
      expect(result.riderId).toBe('new-rider-id')

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(2)
      const firstSlug = (insertCalls[0].args![0] as Record<string, unknown>).slug
      const secondSlug = (insertCalls[1].args![0] as Record<string, unknown>).slug
      expect(firstSlug).toBe('john-doe')
      expect(secondSlug).toBe('john-doe-2')
    })

    it('creates rider successfully with email', async () => {
      // Email lookup returns no matches (default empty list)
      // Insert succeeds
      mockModule.__mockInsertSuccess({ id: 'new-rider-id' })

      const result = await createRider({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(true)
      expect(result.riderId).toBe('new-rider-id')

      // Verify insert was called on the riders table
      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
      const insertData = insertCalls[0].args![0] as Record<string, unknown>
      expect(insertData.email).toBe('john@example.com')
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

describe('updateRider', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when firstName is empty', async () => {
      const result = await updateRider('rider-1', {
        firstName: '',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('First name and last name are required')
    })

    it('returns error when lastName is whitespace only', async () => {
      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: '   ',
        email: 'john@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('First name and last name are required')
    })
  })

  describe('duplicate email check', () => {
    it('returns error when email is used by another rider', async () => {
      // updateRider now uses .ilike(...).neq(...).limit(1) which resolves to a list
      mockModule.__mockRidersFound([{ id: 'other-rider' }])

      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'taken@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Another rider already has this email address')
    })
  })

  describe('successful update', () => {
    it('updates rider without email', async () => {
      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: null,
      })

      expect(result.success).toBe(true)

      // Verify update was called on the riders table
      const updateCalls = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'update'
      )
      expect(updateCalls).toHaveLength(1)
      const updateData = updateCalls[0].args![0] as Record<string, unknown>
      expect(updateData.first_name).toBe('John')
    })

    it('updates rider with email when no duplicate exists', async () => {
      mockModule.__mockRiderNotFound()

      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      expect(result.success).toBe(true)

      // Verify update was called on the riders table
      const updateCalls = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'update'
      )
      expect(updateCalls).toHaveLength(1)
      const updateData = updateCalls[0].args![0] as Record<string, unknown>
      expect(updateData.email).toBe('john@example.com')
    })

    it('revalidates riders and results caches after a successful update', async () => {
      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: null,
      })

      expect(result.success).toBe(true)
      expect(revalidateTag).toHaveBeenCalledWith('riders', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('results', { expire: 0 })
    })
  })

  describe('cache revalidation', () => {
    it('skips public cache revalidation for an email-only edit', async () => {
      // Current row has the same name; only the (non-public) email changes.
      mockModule.__mockRiderFound({
        slug: 'john-doe',
        first_name: 'John',
        last_name: 'Doe',
        hidden: false,
      })

      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'new@example.com',
      })

      expect(result.success).toBe(true)
      // Email is never shown publicly — nothing public changed, so no bust.
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('revalidates public caches (incl. the rider slug) when visibility is toggled', async () => {
      mockModule.__mockRiderFound({
        slug: 'john-doe',
        first_name: 'John',
        last_name: 'Doe',
        hidden: false,
      })

      const result = await updateRider('rider-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: null,
        hidden: true,
      })

      expect(result.success).toBe(true)
      expect(revalidateTag).toHaveBeenCalledWith('riders', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('results', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('records', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('awards', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('registrations', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('rider-john-doe', { expire: 0 })
    })
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

      expect(result.success).toBe(true)

      // Verify DB operations: query/move registrations, query/move results,
      // query/move rider_memberships, delete riders, update target rider
      const regSelects = mockModule.__calls.filter(
        (c) => c.table === 'registrations' && c.method === 'select'
      )
      expect(regSelects.length).toBeGreaterThanOrEqual(2)

      const resultSelects = mockModule.__calls.filter(
        (c) => c.table === 'results' && c.method === 'select'
      )
      expect(resultSelects.length).toBeGreaterThanOrEqual(2)

      const membershipSelects = mockModule.__calls.filter(
        (c) => c.table === 'rider_memberships' && c.method === 'select'
      )
      expect(membershipSelects.length).toBeGreaterThanOrEqual(2)

      const riderDeletes = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'delete'
      )
      expect(riderDeletes).toHaveLength(1)

      const riderUpdates = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'update'
      )
      expect(riderUpdates).toHaveLength(1)
    })

    it('revalidates riders, results, and registrations caches after a successful merge', async () => {
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

      expect(result.success).toBe(true)
      expect(revalidateTag).toHaveBeenCalledWith('riders', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('results', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('registrations', { expire: 0 })
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

      // Same operations regardless of merge count
      const regSelects = mockModule.__calls.filter(
        (c) => c.table === 'registrations' && c.method === 'select'
      )
      expect(regSelects.length).toBeGreaterThanOrEqual(2)

      const resultSelects = mockModule.__calls.filter(
        (c) => c.table === 'results' && c.method === 'select'
      )
      expect(resultSelects.length).toBeGreaterThanOrEqual(2)

      const membershipSelects = mockModule.__calls.filter(
        (c) => c.table === 'rider_memberships' && c.method === 'select'
      )
      expect(membershipSelects.length).toBeGreaterThanOrEqual(2)

      const riderDeletes = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'delete'
      )
      expect(riderDeletes).toHaveLength(1)

      const riderUpdates = mockModule.__calls.filter(
        (c) => c.table === 'riders' && c.method === 'update'
      )
      expect(riderUpdates).toHaveLength(1)
    })
  })
})
