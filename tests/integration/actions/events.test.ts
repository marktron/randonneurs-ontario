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

vi.mock('@/lib/email/ses', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  fromEmail: 'no-reply@randonneurs.to',
  suppressAdminEmails: false,
  isEmailConfigured: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/email/results-spreadsheet', () => ({
  generateAcpXlsx: vi.fn().mockResolvedValue({
    buffer: Buffer.from('mock-xlsx-content'),
    filename: '20250115-Test_Event200.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  generateAcpCsv: vi.fn().mockReturnValue({
    content: 'NOM,PRENOM\nDoe,John',
    filename: '20250115-Test_Event200.csv',
    mimeType: 'text/csv',
  }),
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

  it('returns error when event status is cancelled', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'cancelled',
      name: 'Test Event',
      event_date: '2025-01-15',
      chapters: { name: 'Toronto' },
    })

    const result = await submitEventResults('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only completed events can have results submitted')
  })

  it('sends email with spreadsheet attachment for brevet events', async () => {
    // Mock event found (completed brevet with distance_km)
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'completed',
      event_type: 'brevet',
      name: 'Test Event',
      event_date: '2025-01-15',
      distance_km: 200,
      chapters: { name: 'Toronto' },
    })

    // Mock results query returns riders
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
            status: 'finished',
            finish_time: '10:30:00',
            note: null,
          },
          {
            riders: { first_name: 'Jane', last_name: 'Smith', gender: 'F' },
            status: 'finished',
            finish_time: '11:00:00',
            note: null,
          },
        ],
        error: null,
      })
    })

    // Mock the status update
    mockModule.__mockUpdateSuccess()

    // Mock chapter query for revalidation
    mockModule.__mockEventFound({ slug: 'toronto' })

    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    const result = await submitEventResults('test-event-id')
    delete process.env.AWS_ACCESS_KEY_ID

    expect(result.success).toBe(true)

    // Verify sendEmail was called with an attachment
    const { sendEmail } = await import('@/lib/email/ses')
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringMatching(/^\d{8}-.+\.xlsx$/),
          }),
        ]),
      })
    )
  })

  it('does not send email for permanent events', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'completed',
      event_type: 'permanent',
      name: 'Test Permanent',
      event_date: '2025-01-15',
      distance_km: 200,
      chapters: { name: 'Toronto' },
    })

    // Mock results query
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
            status: 'finished',
            finish_time: '10:30:00',
            note: null,
          },
        ],
        error: null,
      })
    })

    // Mock the status update
    mockModule.__mockUpdateSuccess()

    // Mock chapter query for revalidation
    mockModule.__mockEventFound({ slug: 'toronto' })

    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    const result = await submitEventResults('test-event-id')
    delete process.env.AWS_ACCESS_KEY_ID

    expect(result.success).toBe(true)

    const { sendEmail } = await import('@/lib/email/ses')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('updates event status to submitted after successful email', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'completed',
      event_type: 'brevet',
      name: 'Test Event',
      event_date: '2025-01-15',
      distance_km: 200,
      chapters: { name: 'Toronto' },
    })

    // Mock results query
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
            status: 'finished',
            finish_time: '10:30:00',
            note: null,
          },
        ],
        error: null,
      })
    })

    // Mock the status update
    mockModule.__mockUpdateSuccess()

    // Mock chapter query for revalidation
    mockModule.__mockEventFound({ slug: 'toronto' })

    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    const result = await submitEventResults('test-event-id')
    delete process.env.AWS_ACCESS_KEY_ID

    expect(result.success).toBe(true)

    // Verify status was updated to 'submitted' on the events table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)
    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData).toMatchObject({ status: 'submitted' })
  })

  it('succeeds with no finished riders — email sent with zero finishers', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'completed',
      event_type: 'brevet',
      name: 'Test Event',
      event_date: '2025-01-15',
      distance_km: 200,
      chapters: { name: 'Toronto' },
    })

    // Mock results query — all DNF, no finished riders
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
            status: 'dnf',
            finish_time: null,
            note: null,
          },
        ],
        error: null,
      })
    })

    // Mock the status update
    mockModule.__mockUpdateSuccess()

    // Mock chapter query for revalidation
    mockModule.__mockEventFound({ slug: 'toronto' })

    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    const result = await submitEventResults('test-event-id')
    delete process.env.AWS_ACCESS_KEY_ID

    expect(result.success).toBe(true)

    // Email should still be sent (with "No finishers recorded.")
    const { sendEmail } = await import('@/lib/email/ses')
    expect(sendEmail).toHaveBeenCalledTimes(1)

    // Status should still be updated to 'submitted'
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)
    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData).toMatchObject({ status: 'submitted' })
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

      // Verify insert was called on the events table
      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
      const insertData = insertCalls[0].args![0] as Record<string, unknown>
      expect(insertData).toMatchObject({
        name: 'Test Brevet',
        event_type: 'brevet',
        distance_km: 200,
        event_date: '2025-06-15',
        start_time: '08:00',
        start_location: 'Toronto',
      })
      expect(insertData.slug).toBeDefined()

      // Verify cache was revalidated
      const { revalidatePath } = await import('next/cache')
      expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
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

    // Verify update was called on the events table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)
    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData).toMatchObject({
      name: 'Updated Name',
      start_time: '09:00',
    })

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
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

    // Verify update was called on the events table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)
    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData).toMatchObject({
      start_location: 'New Location',
    })
    // Should not contain fields that weren't submitted
    expect(updateData.name).toBeUndefined()
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

    // Verify update was called on the events table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)

    // Verify createPendingResultsAndSendEmails was called
    const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
    expect(createPendingResultsAndSendEmails).toHaveBeenCalledTimes(1)
    expect(createPendingResultsAndSendEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        name: 'Test Event',
      })
    )

    // Verify cache was revalidated
    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
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

    // Verify results were deleted and status was updated on events table
    const deleteCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'delete'
    )
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1)

    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('re-completing an already completed event does not trigger pending result creation', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2025-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'completed', // Already completed — not 'scheduled'
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

    const result = await updateEventStatus('event-1', 'completed')

    expect(result.success).toBe(true)

    // createPendingResultsAndSendEmails should NOT be called
    // (only triggered when transitioning from 'scheduled' to 'completed')
    const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
    expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
  })

  it('returns error when result deletion fails during cancellation', async () => {
    // Mock delete to return an error (the first .then() call is the delete operation)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({ data: null, error: { message: 'FK constraint' } })
    })

    const result = await updateEventStatus('event-1', 'cancelled')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to delete results')

    // Status should NOT have been updated
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(0)
  })
})
