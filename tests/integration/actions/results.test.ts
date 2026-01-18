import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for result actions.
 *
 * These tests focus on:
 * 1. Input validation
 * 2. Duplicate result prevention
 * 3. Error handling
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

    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.then = vi.fn((resolve) => {
      resolve({ data: null, error: null })
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
        resolve({ data: null, error: null })
      })
    },
    __mockResultFound: (result: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: result, error: null })
    },
    __mockResultNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockExistingResult: (result: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: result, error: null })
    },
    __mockNoExistingResult: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockInsertSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockInsertError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
    __mockUpdateSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi
    .fn()
    .mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'admin',
    }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/chapter-config', () => ({
  getUrlSlugFromDbSlug: vi.fn((slug: string) => (slug === 'toronto' ? 'toronto' : null)),
}))

// Import after mocks
import { createResult, updateResult, deleteResult, createBulkResults } from '@/lib/actions/results'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockResultFound: (result: unknown) => void
  __mockResultNotFound: () => void
  __mockExistingResult: (result: unknown) => void
  __mockNoExistingResult: () => void
  __mockInsertSuccess: () => void
  __mockInsertError: (error: unknown) => void
  __mockUpdateSuccess: () => void
}>('@/lib/supabase-server')

describe('createResult', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when result already exists', async () => {
    mockModule.__mockExistingResult({ id: 'result-1' })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'finished',
      finishTime: '13:30',
      season: 2025,
      distanceKm: 200,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('A result already exists for this rider in this event')
  })

  it('creates result successfully when no duplicate', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'finished',
      finishTime: '13:30',
      season: 2025,
      distanceKm: 200,
    })

    expect(result.success).toBe(true)
  })

  it('handles database errors', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertError({
      code: '23503',
      message: 'foreign key violation',
    })

    const result = await createResult({
      eventId: 'invalid-event',
      riderId: 'rider-1',
      status: 'finished',
      season: 2025,
      distanceKm: 200,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('allows null finish time for non-finished statuses', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'dnf',
      finishTime: null,
      season: 2025,
      distanceKm: 200,
    })

    expect(result.success).toBe(true)
  })
})

describe('updateResult', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('updates result successfully', async () => {
    mockModule.__mockResultFound({ id: 'result-1', event_id: 'event-1' })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockResultFound({ event_id: 'event-1' })
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await updateResult('result-1', {
      finishTime: '14:00',
      status: 'finished',
    })

    expect(result.success).toBe(true)
  })

  it('handles partial updates', async () => {
    mockModule.__mockResultFound({ id: 'result-1', event_id: 'event-1' })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockResultFound({ event_id: 'event-1' })
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await updateResult('result-1', {
      finishTime: '14:00',
    })

    expect(result.success).toBe(true)
  })

  it('handles database errors', async () => {
    mockModule.__mockResultFound({ id: 'result-1', event_id: 'event-1' })
    mockModule.__mockInsertError({
      code: '23505',
      message: 'constraint violation',
    })

    const result = await updateResult('result-1', {
      status: 'finished',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('deleteResult', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('deletes result successfully', async () => {
    mockModule.__mockResultFound({ id: 'result-1', event_id: 'event-1' })
    mockModule.__mockUpdateSuccess() // For delete
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await deleteResult('result-1')

    expect(result.success).toBe(true)
  })

  it('handles database errors', async () => {
    mockModule.__mockResultFound({ id: 'result-1', event_id: 'event-1' })
    mockModule.__mockInsertError({
      code: 'PGRST116',
      message: 'not found',
    })

    const result = await deleteResult('result-1')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('createBulkResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('creates multiple results successfully', async () => {
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await createBulkResults(
      'event-1',
      [
        { riderId: 'rider-1', status: 'finished', finishTime: '13:30' },
        { riderId: 'rider-2', status: 'dnf' },
      ],
      2025,
      200
    )

    expect(result.success).toBe(true)
  })

  it('handles database errors', async () => {
    mockModule.__mockInsertError({
      code: '23503',
      message: 'foreign key violation',
    })

    const result = await createBulkResults(
      'invalid-event',
      [{ riderId: 'rider-1', status: 'finished' }],
      2025,
      200
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('handles empty results array', async () => {
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      chapters: { slug: 'toronto' },
      season: 2025,
    })

    const result = await createBulkResults('event-1', [], 2025, 200)

    expect(result.success).toBe(true)
  })
})
