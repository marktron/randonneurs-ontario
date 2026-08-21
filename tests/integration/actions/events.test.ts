import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Most tests assume ERW sync is enabled (production behavior); individual tests
// that verify the dev/preview gate stub VERCEL_ENV to something else.
vi.stubEnv('VERCEL_ENV', 'production')

afterAll(() => {
  vi.unstubAllEnvs()
})

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

// The current season is computed at test-run time so fixtures never hardcode
// an absolute year that could silently expire (see docs/TESTING.md).
const CURRENT_SEASON = new Date().getFullYear()

vi.mock('@/lib/season', () => ({
  getCurrentSeason: vi.fn(() => CURRENT_SEASON),
  getCurrentSeasonLabel: vi.fn(() => String(CURRENT_SEASON)),
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

vi.mock('@/lib/events/send-result-reminders', () => ({
  sendResultSubmissionReminders: vi.fn().mockResolvedValue({ emailsSent: 0, errors: [] }),
}))

vi.mock('@/lib/email/ses', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  fromEmail: 'no-reply@randonneurs.to',
  isEmailConfigured: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/erw/client', () => ({
  createErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
  updateErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
  deleteErwEvent: vi.fn().mockResolvedValue({ success: true }),
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
  sendResultReminderEmails,
  publishSeasonDrafts,
} from '@/lib/actions/events'
import { sendResultSubmissionReminders } from '@/lib/events/send-result-reminders'
import { requireAdmin } from '@/lib/auth/get-admin'

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

  it('calls ERW deleteErwEvent when event has erw_event_id', async () => {
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 1)

    mockModule.__mockEventFound({
      id: 'test-event-id',
      name: 'Test Event',
      event_date: futureDate.toISOString().split('T')[0],
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      erw_event_id: 'erw-to-delete',
    })
    mockModule.__mockUpdateSuccess() // DB delete
    mockModule.__mockEventFound({ slug: 'toronto' }) // Chapter revalidation

    const result = await deleteEvent('test-event-id')

    expect(result.success).toBe(true)

    const { deleteErwEvent: mockDeleteErw } = await import('@/lib/erw/client')
    expect(mockDeleteErw).toHaveBeenCalledWith('erw-to-delete')
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

    // Verify body formats times as "Xh MM" with no seconds
    const call = (sendEmail as unknown as { mock: { calls: Array<Array<{ text: string }>> } }).mock
      .calls[0][0]
    expect(call.text).toContain('John Doe: 10h 30')
    expect(call.text).toContain('Jane Smith: 11h 00')
    expect(call.text).not.toMatch(/\d:\d{2}:\d{2}/)
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
      mockModule.__mockUpdateSuccess() // For ERW column update
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

    it('calls ERW createErwEvent after successful creation for brevet events', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      // Mock the route lookup query for rwgps_id
      mockModule.__mockEventFound({ rwgps_id: '12345678' })
      // Mock the ERW column update
      mockModule.__mockUpdateSuccess()
      // Mock chapter slug for revalidation
      mockModule.__mockEventFound({ slug: 'toronto' })

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        routeId: 'route-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
        startTime: '08:00',
      })

      expect(result.success).toBe(true)

      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Brevet',
          distanceKm: 200,
          eventDate: '2025-06-15',
          rwgpsId: '12345678',
        })
      )
    })

    it('skips ERW sync for permanent events', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-permanent-id' })
      mockModule.__mockEventFound({ slug: 'toronto' })

      const result = await createEvent({
        name: 'Permanent Ride',
        chapterId: 'chapter-1',
        eventType: 'permanent',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(true)

      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()
    })

    it('skips ERW sync outside Vercel production (local dev / preview)', async () => {
      vi.stubEnv('VERCEL_ENV', 'preview')

      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' })

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        routeId: 'route-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(true)

      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()

      vi.stubEnv('VERCEL_ENV', 'production')
    })

    it('still creates event locally when ERW fails', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ rwgps_id: null })
      mockModule.__mockEventFound({ slug: 'toronto' })

      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      vi.mocked(mockCreateErw).mockResolvedValueOnce({
        success: false,
        error: 'ERW API error: 500',
      })

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        routeId: 'route-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: '2025-06-15',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.id).toBe('new-event-id')
      }
    })

    it('inserts status draft and skips ERW sync when status is draft', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-draft-id' })
      mockModule.__mockEventFound({ slug: 'toronto' }) // chapter revalidation

      const result = await createEvent({
        name: 'Next Season Brevet',
        chapterId: 'chapter-1',
        routeId: 'route-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON + 1}-06-15`,
        status: 'draft',
      })

      expect(result.success).toBe(true)

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
      expect((insertCalls[0].args![0] as Record<string, unknown>).status).toBe('draft')

      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()
    })

    it('defaults status to scheduled when omitted', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ rwgps_id: null }) // route lookup
      mockModule.__mockUpdateSuccess() // ERW column update
      mockModule.__mockEventFound({ slug: 'toronto' })

      await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        routeId: 'route-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON + 1}-06-15`,
      })

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect((insertCalls[0].args![0] as Record<string, unknown>).status).toBe('scheduled')
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

  describe('current-season brevet rule', () => {
    it('blocks a regular admin from creating a current-season brevet, without attempting an insert', async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        chapter_id: null,
        phone: null,
        created_at: null,
        updated_at: null,
      })

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON}-06-15`,
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/brevet/i)
      expect(result.error).toMatch(new RegExp(String(CURRENT_SEASON)))

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(0)
    })

    it('allows a super_admin to create a current-season brevet', async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'super_admin',
        chapter_id: null,
        phone: null,
        created_at: null,
        updated_at: null,
      })
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' }) // For chapter revalidation

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON}-06-15`,
      })

      expect(result.success).toBe(true)

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
    })

    it('allows a regular admin to create a current-season populaire', async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        chapter_id: null,
        phone: null,
        created_at: null,
        updated_at: null,
      })
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' }) // For chapter revalidation

      const result = await createEvent({
        name: 'Test Populaire',
        chapterId: 'chapter-1',
        eventType: 'populaire',
        distanceKm: 100,
        eventDate: `${CURRENT_SEASON}-06-15`,
      })

      expect(result.success).toBe(true)

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
    })

    it('allows a regular admin to create a next-season brevet', async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        chapter_id: null,
        phone: null,
        created_at: null,
        updated_at: null,
      })
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' }) // For chapter revalidation

      const result = await createEvent({
        name: 'Test Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON + 1}-06-15`,
      })

      expect(result.success).toBe(true)

      const insertCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'insert'
      )
      expect(insertCalls).toHaveLength(1)
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

  it('calls ERW updateErwEvent when event has erw_event_id', async () => {
    mockModule.__mockUpdateSuccess() // DB update
    mockModule.__mockEventFound({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'test-event',
      erw_event_id: 'erw-existing-123',
      route_id: 'route-1',
      name: 'Updated Name',
      description: null,
      distance_km: 200,
      event_date: '2025-06-15',
      start_time: '08:00',
    })
    mockModule.__mockEventFound({ rwgps_id: '99999' }) // Route lookup
    mockModule.__mockUpdateSuccess() // ERW canonical URL update
    mockModule.__mockEventFound({ slug: 'toronto' }) // Chapter revalidation (happens inside revalidateCalendarTags)

    const result = await updateEvent('event-1', { name: 'Updated Name' })

    expect(result.success).toBe(true)

    const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
    expect(mockUpdateErw).toHaveBeenCalledWith(
      'erw-existing-123',
      expect.objectContaining({ name: 'Updated Name' })
    )
  })

  it('skips ERW sync outside Vercel production even when event is linked', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')

    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'test-event',
      erw_event_id: 'erw-existing-123',
      route_id: 'route-1',
      name: 'Updated Name',
      description: null,
      distance_km: 200,
      event_date: '2025-06-15',
      start_time: '08:00',
    })
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await updateEvent('event-1', { name: 'Updated Name' })

    expect(result.success).toBe(true)

    const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
    expect(mockUpdateErw).not.toHaveBeenCalled()

    vi.stubEnv('VERCEL_ENV', 'production')
  })

  it('skips ERW sync when event has no erw_event_id', async () => {
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'test-event',
      erw_event_id: null,
    })
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await updateEvent('event-1', { name: 'Updated Name' })

    expect(result.success).toBe(true)

    const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
    expect(mockUpdateErw).not.toHaveBeenCalled()
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

  it('calls ERW deleteErwEvent when cancelling event with erw_event_id', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2025-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      erw_event_id: 'erw-cancel-123',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess() // Delete results
    mockModule.__mockUpdateSuccess() // Status update
    mockModule.__mockUpdateSuccess() // Clear ERW columns
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await updateEventStatus('event-1', 'cancelled')

    expect(result.success).toBe(true)

    const { deleteErwEvent: mockDeleteErw } = await import('@/lib/erw/client')
    expect(mockDeleteErw).toHaveBeenCalledWith('erw-cancel-123')
  })

  it('writes description alongside status when description option is provided', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2030-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess() // For deleting results
    mockModule.__mockUpdateSuccess() // For status update
    mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

    const result = await updateEventStatus('event-1', 'cancelled', {
      description: 'CANCELLED: weather. Original description follows.\n\nA brevet through Toronto.',
    })

    expect(result.success).toBe(true)

    // The events update call should have included a description field
    const eventsUpdateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    const updateWithDescription = eventsUpdateCalls.find((call) => {
      const payload = call.args?.[0] as { description?: string } | undefined
      return payload?.description?.startsWith('CANCELLED: weather.')
    })
    expect(updateWithDescription).toBeDefined()
  })

  it('does not write description when options omitted', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2030-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess() // status update
    mockModule.__mockEventFound({ slug: 'toronto' }) // revalidation

    const result = await updateEventStatus('event-1', 'scheduled')

    expect(result.success).toBe(true)
    const eventsUpdateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(eventsUpdateCalls.length).toBeGreaterThan(0)
    const payload = eventsUpdateCalls[0].args?.[0] as Record<string, unknown>
    expect('description' in payload).toBe(false)
  })

  it('writes description as null when explicitly provided', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: '2030-06-15',
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      chapters: { name: 'Toronto' },
    })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await updateEventStatus('event-1', 'scheduled', { description: null })

    expect(result.success).toBe(true)
    const eventsUpdateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    const payload = eventsUpdateCalls[0].args?.[0] as Record<string, unknown>
    expect(payload.description).toBeNull()
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

  it('publishing a draft (draft -> scheduled) syncs the event to ERW', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Next Season 200',
      event_date: `${CURRENT_SEASON + 1}-06-15`,
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'draft',
      erw_event_id: null,
      slug: 'next-season-200-200km',
      description: null,
      start_time: '07:00',
      route_id: null,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
    mockModule.__mockUpdateSuccess() // status update
    mockModule.__mockUpdateSuccess() // ERW column update
    mockModule.__mockEventFound({ slug: 'toronto' }) // revalidation

    const result = await updateEventStatus('event-1', 'scheduled')

    expect(result.success).toBe(true)
    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    expect(mockCreateErw).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Next Season 200', slug: 'next-season-200-200km' })
    )
    const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
    expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
  })

  it('refuses to move a published event back to draft', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: `${CURRENT_SEASON + 1}-06-15`,
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      erw_event_id: null,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    const result = await updateEventStatus('event-1', 'draft')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Published events cannot be moved back to draft')
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(0)
  })

  it('does not sync to ERW when a scheduled event is re-saved as scheduled', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Event',
      event_date: `${CURRENT_SEASON + 1}-06-15`,
      distance_km: 200,
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      status: 'scheduled',
      erw_event_id: 'erw-existing',
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
    mockModule.__mockUpdateSuccess()
    mockModule.__mockEventFound({ slug: 'toronto' })

    await updateEventStatus('event-1', 'scheduled')

    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    expect(mockCreateErw).not.toHaveBeenCalled()
  })
})

describe('sendResultReminderEmails', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    vi.mocked(sendResultSubmissionReminders).mockResolvedValue({ emailsSent: 0, errors: [] })
  })

  it('returns error when event is not found', async () => {
    const result = await sendResultReminderEmails('nonexistent-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
    expect(sendResultSubmissionReminders).not.toHaveBeenCalled()
  })

  it('returns error when event is not completed', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      status: 'scheduled',
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    const result = await sendResultReminderEmails('event-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('completed')
    expect(sendResultSubmissionReminders).not.toHaveBeenCalled()
  })

  it('sends reminders for a completed event and returns the count', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      status: 'completed',
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
    vi.mocked(sendResultSubmissionReminders).mockResolvedValue({ emailsSent: 3, errors: [] })

    const result = await sendResultReminderEmails('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ emailsSent: 3 })
    expect(sendResultSubmissionReminders).toHaveBeenCalledWith({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
  })

  it('returns error when no emails could be sent and errors occurred', async () => {
    mockModule.__mockEventFound({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      status: 'completed',
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
    vi.mocked(sendResultSubmissionReminders).mockResolvedValue({
      emailsSent: 0,
      errors: ['Failed to send result reminder email: SES exploded'],
    })

    const result = await sendResultReminderEmails('event-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to send')
  })
})

describe('publishSeasonDrafts', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  const superAdmin = {
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Super Admin',
    role: 'super_admin',
    chapter_id: null,
    phone: null,
    created_at: null,
    updated_at: null,
  }

  it('rejects non-super-admins without touching the database', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ ...superAdmin, role: 'admin' })

    const result = await publishSeasonDrafts(CURRENT_SEASON + 1)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only super admins can publish a season')
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('publishes only draft rows of the given season and syncs each to ERW', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)
    // UPDATE ... RETURNING rows (resolved via `then`)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            id: 'e1',
            name: 'A 200',
            description: null,
            distance_km: 200,
            event_date: `${CURRENT_SEASON + 1}-05-02`,
            start_time: '07:00',
            slug: 'a-200',
            route_id: null,
            event_type: 'brevet',
            chapter_id: 'chapter-1',
          },
          {
            id: 'e2',
            name: 'B Perm',
            description: null,
            distance_km: 200,
            event_date: `${CURRENT_SEASON + 1}-05-09`,
            start_time: null,
            slug: 'b-perm',
            route_id: null,
            event_type: 'permanent',
            chapter_id: 'chapter-1',
          },
        ],
        error: null,
      })
    })
    mockModule.__mockUpdateSuccess() // ERW column write for e1
    mockModule.__mockEventFound({ slug: 'toronto' }) // chapter revalidation

    const result = await publishSeasonDrafts(CURRENT_SEASON + 1)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 2, erwFailures: 0 })
    }

    const eqCalls = mockModule.__calls.filter((c) => c.table === 'events' && c.method === 'eq')
    expect(eqCalls.map((c) => c.args)).toEqual(
      expect.arrayContaining([
        ['season', CURRENT_SEASON + 1],
        ['status', 'draft'],
      ])
    )

    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    expect(mockCreateErw).toHaveBeenCalledTimes(1) // permanent skipped
    expect(mockCreateErw).toHaveBeenCalledWith(expect.objectContaining({ slug: 'a-200' }))
  })

  it('counts ERW failures without failing the publish', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          {
            id: 'e1',
            name: 'A 200',
            description: null,
            distance_km: 200,
            event_date: `${CURRENT_SEASON + 1}-05-02`,
            start_time: null,
            slug: 'a-200',
            route_id: null,
            event_type: 'brevet',
            chapter_id: 'chapter-1',
          },
        ],
        error: null,
      })
    })
    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    vi.mocked(mockCreateErw).mockResolvedValueOnce({ success: false, error: 'boom' })
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await publishSeasonDrafts(CURRENT_SEASON + 1)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 1, erwFailures: 1 })
    }
  })
})
