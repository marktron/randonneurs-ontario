import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for event actions.
 *
 * Note: Full database operation tests are covered in E2E tests because
 * Supabase's chainable query builder is complex to mock accurately.
 * These tests focus on:
 * 1. Input validation
 * 2. Business logic that can be tested with minimal mocking
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  // Track call history
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []

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

    // Terminal methods that return promises
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    builder.then = vi.fn((resolve) => {
      resolve({ data: null, error: null })
    })

    return builder
  }

  let currentTable = ''
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
        resolve({ data: null, error: null })
      })
    },
    __mockEventFound: (event: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: event, error: null })
    },
    __mockInsertSuccess: (data: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data, error: null })
    },
    __mockInsertError: (error: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error })
    },
    __mockUpdateSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockUpdateError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi
    .fn()
    .mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', name: 'Test Admin' }),
  getAdmin: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/chapter-config', () => ({
  getUrlSlugFromDbSlug: vi.fn((slug: string) => (slug === 'toronto' ? 'toronto' : null)),
}))

vi.mock('@/lib/events/complete-event', () => ({
  createPendingResultsAndSendEmails: vi
    .fn()
    .mockResolvedValue({ resultsCreated: 0, emailsSent: 0, errors: [] }),
}))

vi.mock('@/lib/email/sendgrid', () => ({
  sendgrid: {
    send: vi.fn().mockResolvedValue({}),
  },
}))

// Import after mocking
import {
  createEvent,
  updateEvent,
  deleteEvent,
  updateEventStatus,
  submitEventResults,
} from '@/lib/actions/events'

// Access mock internals for test configuration
const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockEventFound: (event: unknown) => void
  __mockInsertSuccess: (data: unknown) => void
  __mockInsertError: (error: unknown) => void
  __mockUpdateSuccess: () => void
  __mockUpdateError: (error: unknown) => void
}>('@/lib/supabase-server')

describe('deleteEvent', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when event is not found', async () => {
    // Default mock returns null/error for single()
    const result = await deleteEvent('non-existent-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('returns error when trying to delete past event', async () => {
    const pastDate = new Date()
    pastDate.setFullYear(pastDate.getFullYear() - 1)

    mockModule.__mockEventFound({
      id: 'test-event-id',
      event_date: pastDate.toISOString().split('T')[0],
      chapter_id: 'chapter-1',
      event_type: 'brevet',
    })

    const result = await deleteEvent('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot delete past events')
  })
})

describe('submitEventResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when event is not found', async () => {
    // Default mock returns null/error for single()
    const result = await submitEventResults('non-existent-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('returns error when event status is already submitted', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'submitted',
      name: 'Test Event',
      event_date: '2025-01-15',
      chapters: { name: 'Toronto' },
    })

    const result = await submitEventResults('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Results have already been submitted')
  })

  it('returns error when event status is not completed', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'scheduled', // Not completed
      name: 'Test Event',
      event_date: '2025-01-15',
      chapters: { name: 'Toronto' },
    })

    const result = await submitEventResults('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only completed events can have results submitted')
  })
})

describe('createEvent', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when name is empty', async () => {
      const result = await createEvent({
        name: '',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error when chapterId is missing', async () => {
      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: '',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error when eventDate is missing', async () => {
      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error when distanceKm is 0', async () => {
      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 0,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })
  })

  describe('successful creation', () => {
    it('returns success with event id when creation succeeds', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' }) // For chapter revalidation

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
        startTime: '08:00',
        startLocation: 'Toronto',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.id).toBe('new-event-id')
      }
    })
  })

  describe('error handling', () => {
    it('returns error when insert fails with duplicate slug', async () => {
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      })

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('An event with this slug already exists')
    })
  })
})

describe('updateEvent', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('updates event successfully', async () => {
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'test-event',
    })

    const result = await updateEvent('event-1', {
      name: 'Updated Name',
      startTime: '09:00',
    })

    expect(result.success).toBe(true)
  })

  it('handles partial updates', async () => {
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'test-event',
    })

    const result = await updateEvent('event-1', {
      startLocation: 'New Location',
    })

    expect(result.success).toBe(true)
  })

  it('returns error when update fails', async () => {
    mockModule.__mockUpdateError({
      code: '23503',
      message: 'foreign key violation',
    })

    const result = await updateEvent('event-1', {
      chapterId: 'invalid-chapter',
    })

    expect(result.success).toBe(false)
    // Foreign key violations return a specific error message
    expect(result.error).toBe('Referenced record does not exist')
  })
})

describe('updateEventStatus', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when event is not found', async () => {
    const result = await updateEventStatus('non-existent-id', 'completed')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('updates status to completed successfully', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2025-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

    const result = await updateEventStatus('event-1', 'completed')

    expect(result.success).toBe(true)
  })

  it('updates status to cancelled successfully', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2025-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess() // For deleting results
    mockModule.__mockUpdateSuccess() // For status update
    mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

    const result = await updateEventStatus('event-1', 'cancelled')

    expect(result.success).toBe(true)
  })
})
