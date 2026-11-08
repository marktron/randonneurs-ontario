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
      'upsert',
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

// The submitted-freeze gate is its own unit (tests/unit/lib/event-mutability.test.ts);
// here it is a controllable stub so each test can say whether the event is
// frozen. The lifecycle table stays real.
const { mockAssertEventMutable } = vi.hoisted(() => ({
  mockAssertEventMutable: vi.fn<
    (eventId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  >(async () => ({ ok: true })),
}))
vi.mock('@/lib/actions/event-mutability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/actions/event-mutability')>()),
  assertEventMutable: (eventId: string) => mockAssertEventMutable(eventId),
}))

// Pass-through spy so tests can assert a failure was reported to Sentry.
vi.mock('@/lib/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/errors')>()
  return { ...actual, handleSupabaseError: vi.fn(actual.handleSupabaseError) }
})

const FROZEN = {
  ok: false as const,
  error: 'Results for this event have been submitted; it is frozen',
}

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
import { handleSupabaseError } from '@/lib/errors'
import { EVENT_STATUS_TRANSITIONS } from '@/lib/events/status'
import type { EventStatus } from '@/lib/events/status'

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

  it('refuses to delete a submitted event without touching the database', async () => {
    mockAssertEventMutable.mockResolvedValueOnce(FROZEN)

    const result = await deleteEvent('event-1')

    expect(result).toEqual({ success: false, error: FROZEN.error })
    expect(mockAssertEventMutable).toHaveBeenCalledWith('event-1')
    expect(mockModule.__calls.filter((c) => c.method === 'delete')).toEqual([])
    const { deleteErwEvent: mockDeleteErw } = await import('@/lib/erw/client')
    expect(mockDeleteErw).not.toHaveBeenCalled()
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

    // Mock the status claim (one row flipped completed -> submitted)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({ data: [{ id: 'test-event-id' }], error: null })
    )

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

  describe('claim-then-send ordering', () => {
    const completedBrevet = {
      id: 'test-event-id',
      status: 'completed',
      event_type: 'brevet',
      name: 'Test Event',
      event_date: '2025-01-15',
      distance_km: 200,
      chapters: { name: 'Toronto' },
    }
    const resultsRows = {
      data: [
        {
          riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
          status: 'finished',
          finish_time: '10:30:00',
          note: null,
        },
      ],
      error: null,
    }

    it('does not send the email when the claim affects zero rows', async () => {
      mockModule.__mockEventFound(completedBrevet)
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => resolve(resultsRows))
      // Claim: event was flipped to submitted by a concurrent click
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      )

      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      const result = await submitEventResults('test-event-id')
      delete process.env.AWS_ACCESS_KEY_ID

      const { sendEmail } = await import('@/lib/email/ses')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Results have already been submitted')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('claims the event filtered on completed, before sending the email', async () => {
      const order: string[] = []
      const { sendEmail } = await import('@/lib/email/ses')
      vi.mocked(sendEmail).mockImplementationOnce(async () => {
        order.push('send')
      })

      mockModule.__mockEventFound(completedBrevet)
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => resolve(resultsRows))
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
        order.push('claim')
        resolve({ data: [{ id: 'test-event-id' }], error: null })
      })

      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      const result = await submitEventResults('test-event-id')
      delete process.env.AWS_ACCESS_KEY_ID

      expect(result.success).toBe(true)
      expect(order).toEqual(['claim', 'send'])

      const eventCalls = mockModule.__calls.filter((c) => c.table === 'events')
      const updateIdx = eventCalls.findIndex((c) => c.method === 'update')
      expect(eventCalls[updateIdx].args![0]).toEqual({ status: 'submitted' })
      const claimChain = eventCalls.slice(updateIdx + 1, updateIdx + 4)
      expect(claimChain.map((c) => [c.method, ...(c.args ?? [])])).toEqual([
        ['eq', 'id', 'test-event-id'],
        ['eq', 'status', 'completed'],
        ['select', 'id'],
      ])
    })

    it('never claims the event when building the email throws', async () => {
      const { generateAcpXlsx, generateAcpCsv } = await import('@/lib/email/results-spreadsheet')
      vi.mocked(generateAcpXlsx).mockRejectedValueOnce(new Error('xlsx boom'))
      vi.mocked(generateAcpCsv).mockImplementationOnce(() => {
        throw new Error('csv boom')
      })

      mockModule.__mockEventFound(completedBrevet)
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => resolve(resultsRows))

      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      const result = await submitEventResults('test-event-id')
      delete process.env.AWS_ACCESS_KEY_ID

      const { sendEmail } = await import('@/lib/email/ses')
      expect(result.success).toBe(false)
      expect(sendEmail).not.toHaveBeenCalled()
      const statusUpdates = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'update'
      )
      expect(statusUpdates).toEqual([])
    })

    it('reverts the claim to completed when the email send fails', async () => {
      const { sendEmail } = await import('@/lib/email/ses')
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SES down'))

      mockModule.__mockEventFound(completedBrevet)
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => resolve(resultsRows))
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'test-event-id' }], error: null })
      )

      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      const result = await submitEventResults('test-event-id')
      delete process.env.AWS_ACCESS_KEY_ID

      expect(result).toEqual({ success: false, error: 'Failed to send email. Please try again.' })

      const eventCalls = mockModule.__calls.filter((c) => c.table === 'events')
      const revertIdx = eventCalls.findIndex(
        (c) =>
          c.method === 'update' && (c.args![0] as Record<string, unknown>).status === 'completed'
      )
      expect(revertIdx).toBeGreaterThan(-1)
      expect(
        eventCalls.slice(revertIdx + 1, revertIdx + 3).map((c) => [c.method, ...(c.args ?? [])])
      ).toEqual([
        ['eq', 'id', 'test-event-id'],
        ['eq', 'status', 'submitted'],
      ])
      expect(handleSupabaseError).not.toHaveBeenCalled()
    })

    it('reports a failed revert and tells the admin the event is stuck', async () => {
      const { sendEmail } = await import('@/lib/email/ses')
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SES down'))
      const revertError = { code: '08006', message: 'connection lost' }

      mockModule.__mockEventFound(completedBrevet)
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => resolve(resultsRows))
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'test-event-id' }], error: null })
      )
      // The revert update fails: the event stays submitted
      mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
        resolve({ data: null, error: revertError })
      )

      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      const result = await submitEventResults('test-event-id')
      delete process.env.AWS_ACCESS_KEY_ID

      expect(result).toEqual({
        success: false,
        error: 'Failed to send email and could not reopen the event; contact the webmaster',
      })
      expect(handleSupabaseError).toHaveBeenCalledWith(
        revertError,
        expect.objectContaining({
          operation: 'submitEventResults',
          context: expect.objectContaining({ eventId: 'test-event-id' }),
        }),
        expect.any(String)
      )
    })
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

    // Mock the status claim (one row flipped completed -> submitted)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({ data: [{ id: 'test-event-id' }], error: null })
    )

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

    // Mock the status claim (one row flipped completed -> submitted)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({ data: [{ id: 'test-event-id' }], error: null })
    )

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

    // Mock the status claim (one row flipped completed -> submitted)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) =>
      resolve({ data: [{ id: 'test-event-id' }], error: null })
    )

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
      mockModule.__mockEventFound({ rwgps_id: '12345678' })
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
      expect(mockCreateErw).toHaveBeenCalledTimes(1)
    })

    it('does not create an ERW event for a scheduled event with no route', async () => {
      mockModule.__mockInsertSuccess({ id: 'new-event-id' })
      mockModule.__mockEventFound({ slug: 'toronto' })

      const result = await createEvent({
        name: 'Routeless Brevet',
        chapterId: 'chapter-1',
        eventType: 'brevet',
        distanceKm: 200,
        eventDate: `${CURRENT_SEASON + 1}-06-15`,
      })

      expect(result.success).toBe(true)
      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()
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

  it('refuses to edit a submitted event without writing anything', async () => {
    mockAssertEventMutable.mockResolvedValueOnce(FROZEN)

    const result = await updateEvent('event-1', {
      name: 'Renamed',
      distanceKm: 210,
      eventDate: `${CURRENT_SEASON}-06-22`,
    })

    expect(result).toEqual({ success: false, error: FROZEN.error })
    expect(mockAssertEventMutable).toHaveBeenCalledWith('event-1')
    const writes = mockModule.__calls.filter((c) =>
      ['update', 'upsert', 'insert', 'delete'].includes(c.method)
    )
    expect(writes).toEqual([])
    const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
    expect(mockUpdateErw).not.toHaveBeenCalled()
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

  describe('slug rotation', () => {
    const stored = (overrides: Record<string, unknown> = {}) => ({
      slug: 'oz-200km-2026-03-28',
      name: 'Oz',
      distance_km: 200,
      event_date: '2026-03-28',
      event_type: 'brevet',
      ...overrides,
    })
    const historyCalls = (method: string) =>
      mockModule.__calls.filter((c) => c.table === 'event_slug_history' && c.method === method)

    it('rotates the slug and records history when the date changes', async () => {
      mockModule.__mockEventFound(stored()) // pre-fetch
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound({
        chapter_id: 'chapter-1',
        event_type: 'brevet',
        slug: 'oz-200km-2026-04-04',
      }) // post-fetch

      const result = await updateEvent('event-1', {
        name: 'Oz',
        distanceKm: 200,
        eventDate: '2026-04-04',
      })

      expect(result.success).toBe(true)
      const upserts = historyCalls('upsert')
      expect(upserts).toHaveLength(1)
      expect(upserts[0].args![0]).toEqual({ slug: 'oz-200km-2026-03-28', event_id: 'event-1' })
      expect(upserts[0].args![1]).toEqual({ onConflict: 'slug' })
      const deletes = historyCalls('delete')
      expect(deletes).toHaveLength(1)
      const historyEqs = mockModule.__calls.filter(
        (c) => c.table === 'event_slug_history' && c.method === 'eq'
      )
      expect(historyEqs[0].args).toEqual(['slug', 'oz-200km-2026-04-04'])
      const updateData = mockModule.__calls.find(
        (c) => c.table === 'events' && c.method === 'update'
      )!.args![0] as Record<string, unknown>
      expect(updateData.slug).toBe('oz-200km-2026-04-04')
      const upsertIdx = mockModule.__calls.findIndex((c) => c.method === 'upsert')
      const deleteIdx = mockModule.__calls.findIndex(
        (c) => c.table === 'event_slug_history' && c.method === 'delete'
      )
      const updateIdx = mockModule.__calls.findIndex(
        (c) => c.table === 'events' && c.method === 'update'
      )
      expect(upsertIdx).toBeLessThan(updateIdx)
      expect(updateIdx).toBeLessThan(deleteIdx)
      const { revalidateTag } = await import('next/cache')
      expect(revalidateTag).toHaveBeenCalledWith('event-oz-200km-2026-04-04', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('event-oz-200km-2026-03-28', { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith('slugs', { expire: 0 })
      const auditInsert = mockModule.__calls.find(
        (c) => c.table === 'audit_logs' && c.method === 'insert'
      )
      expect(auditInsert?.args?.[0]).toEqual(
        expect.objectContaining({
          description: 'Updated event: Oz (slug oz-200km-2026-03-28 → oz-200km-2026-04-04)',
        })
      )
    })

    it('passes the rotated slug to ERW updateErwEvent', async () => {
      mockModule.__mockEventFound(stored()) // pre-fetch
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound({
        chapter_id: 'chapter-1',
        event_type: 'brevet',
        slug: 'oz-200km-2026-04-04',
        erw_event_id: 'erw-existing-123',
        route_id: 'route-1',
        name: 'Oz',
        description: null,
        distance_km: 200,
        event_date: '2026-04-04',
        start_time: '08:00',
      }) // post-fetch
      mockModule.__mockEventFound({ rwgps_id: '99999' }) // Route lookup
      mockModule.__mockUpdateSuccess() // ERW canonical URL update
      mockModule.__mockEventFound({ slug: 'toronto' }) // Chapter revalidation

      const result = await updateEvent('event-1', {
        name: 'Oz',
        distanceKm: 200,
        eventDate: '2026-04-04',
      })

      expect(result.success).toBe(true)
      const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
      expect(mockUpdateErw).toHaveBeenCalledWith(
        'erw-existing-123',
        expect.objectContaining({ slug: 'oz-200km-2026-04-04' })
      )
    })

    it('does not touch the slug or history when only the name changes', async () => {
      mockModule.__mockEventFound(stored()) // pre-fetch
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound({
        chapter_id: 'chapter-1',
        event_type: 'brevet',
        slug: 'oz-200km-2026-03-28',
      })

      const result = await updateEvent('event-1', {
        name: 'Oz Renamed',
        distanceKm: 200,
        eventDate: '2026-03-28',
      })

      expect(result.success).toBe(true)
      expect(mockModule.__calls.filter((c) => c.table === 'event_slug_history')).toHaveLength(0)
      const updateData = mockModule.__calls.find(
        (c) => c.table === 'events' && c.method === 'update'
      )!.args![0] as Record<string, unknown>
      expect(updateData.slug).toBeUndefined()
      expect(updateData.name).toBe('Oz Renamed')
    })

    it('does not rotate permanents', async () => {
      mockModule.__mockEventFound(
        stored({ event_type: 'permanent', slug: 'perm-200km-2026-03-28', name: 'Perm' })
      )
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound({
        chapter_id: 'chapter-1',
        event_type: 'permanent',
        slug: 'perm-200km-2026-03-28',
      })

      const result = await updateEvent('event-1', {
        name: 'Perm',
        distanceKm: 200,
        eventDate: '2026-04-04',
      })

      expect(result.success).toBe(true)
      expect(mockModule.__calls.filter((c) => c.table === 'event_slug_history')).toHaveLength(0)
      const updateData = mockModule.__calls.find(
        (c) => c.table === 'events' && c.method === 'update'
      )!.args![0] as Record<string, unknown>
      expect(updateData.slug).toBeUndefined()
      expect(updateData.event_date).toBe('2026-04-04')
    })

    it('maps a slug unique violation on update to the slug-exists message', async () => {
      mockModule.__mockEventFound(stored()) // pre-fetch
      mockModule.__mockUpdateSuccess() // history upsert
      mockModule.__mockUpdateError({ code: '23505', message: 'duplicate key' })

      const result = await updateEvent('event-1', {
        name: 'Oz',
        distanceKm: 200,
        eventDate: '2026-04-04',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('An event with this slug already exists')
    })

    it('does not pre-fetch when eventDate is absent', async () => {
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound({ chapter_id: 'chapter-1', event_type: 'brevet', slug: 's' })

      await updateEvent('event-1', { name: 'Only Name' })

      const updateIdx = mockModule.__calls.findIndex((c) => c.method === 'update')
      expect(updateIdx).toBeGreaterThanOrEqual(0)
      const selectsBeforeUpdate = mockModule.__calls
        .slice(0, updateIdx)
        .filter((c) => c.method === 'select')
      expect(selectsBeforeUpdate).toHaveLength(0)
    })
  })

  describe('unlinked event gains a route', () => {
    const unlinkedRow = (overrides: Record<string, unknown> = {}) => ({
      chapter_id: 'chapter-1',
      event_type: 'brevet',
      slug: 'next-season-200-200km',
      erw_event_id: null,
      route_id: 'route-1',
      name: 'Next Season 200',
      description: null,
      distance_km: 200,
      event_date: `${CURRENT_SEASON + 1}-06-15`,
      start_time: '07:00',
      status: 'scheduled',
      ...overrides,
    })

    it('creates the ERW event for an unlinked scheduled event with an RWGPS route', async () => {
      mockModule.__mockUpdateSuccess() // DB update
      mockModule.__mockEventFound(unlinkedRow()) // post-update select
      mockModule.__mockEventFound({ slug: 'toronto' }) // chapter revalidation
      mockModule.__mockEventFound({ rwgps_id: '12345678' }) // route lookup
      mockModule.__mockUpdateSuccess() // ERW id write

      const result = await updateEvent('event-1', { routeId: 'route-1' })

      expect(result.success).toBe(true)
      const { createErwEvent: mockCreateErw, updateErwEvent: mockUpdateErw } =
        await import('@/lib/erw/client')
      expect(mockCreateErw).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'next-season-200-200km', rwgpsId: '12345678' })
      )
      expect(mockUpdateErw).not.toHaveBeenCalled()
      const erwWrite = mockModule.__calls.find(
        (c) =>
          c.table === 'events' &&
          c.method === 'update' &&
          (c.args?.[0] as Record<string, unknown>)?.erw_event_id === 'erw-test-123'
      )
      expect(erwWrite).toBeDefined()
    })

    it('selects status so the scheduled check can run', async () => {
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound(unlinkedRow())

      await updateEvent('event-1', { routeId: 'route-1' })

      const select = mockModule.__calls.find((c) => c.table === 'events' && c.method === 'select')
      expect(String(select?.args?.[0])).toContain('status')
    })

    it('does not create an ERW event while the unlinked event has no RWGPS route', async () => {
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound(unlinkedRow({ route_id: null }))
      mockModule.__mockEventFound({ slug: 'toronto' })

      const result = await updateEvent('event-1', { name: 'Renamed' })

      expect(result.success).toBe(true)
      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()
    })

    it.each([
      ['a draft', { status: 'draft' }],
      ['a permanent', { event_type: 'permanent' }],
      ['a cancelled event', { status: 'cancelled' }],
    ])('does not create an ERW event for %s', async (_label, overrides) => {
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound(unlinkedRow(overrides))
      mockModule.__mockEventFound({ slug: 'toronto' })
      mockModule.__mockEventFound({ rwgps_id: '12345678' })

      const result = await updateEvent('event-1', { routeId: 'route-1' })

      expect(result.success).toBe(true)
      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      expect(mockCreateErw).not.toHaveBeenCalled()
    })

    it('still succeeds locally when the ERW create fails', async () => {
      mockModule.__mockUpdateSuccess()
      mockModule.__mockEventFound(unlinkedRow())
      mockModule.__mockEventFound({ slug: 'toronto' })
      mockModule.__mockEventFound({ rwgps_id: '12345678' })
      const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
      vi.mocked(mockCreateErw).mockResolvedValueOnce({ success: false, error: 'quota' })

      const result = await updateEvent('event-1', { routeId: 'route-1' })

      expect(result.success).toBe(true)
      expect(mockCreateErw).toHaveBeenCalledTimes(1)
    })
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

    // A real transition: a same-state request is a no-op and writes nothing.
    const result = await updateEventStatus('event-1', 'completed')

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
    mockModule.__mockUpdateSuccess() // results delete
    mockModule.__mockUpdateSuccess() // status update
    mockModule.__mockEventFound({ slug: 'toronto' })

    // The cancel dialog sends null when the textarea is cleared. (A same-state
    // request is a no-op and writes nothing, so this needs a real transition.)
    const result = await updateEventStatus('event-1', 'cancelled', { description: null })

    expect(result.success).toBe(true)
    const eventsUpdateCalls = mockModule.__calls.filter(
      (c) => c.table === 'events' && c.method === 'update'
    )
    const payload = eventsUpdateCalls[0].args?.[0] as Record<string, unknown>
    expect(payload.description).toBeNull()
  })

  it('returns error when result deletion fails during cancellation', async () => {
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
    // Mock delete to return an error (the delete runs after the event fetch,
    // which resolves via .single() rather than .then(), so this is still the
    // first .then() call).
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
      route_id: 'route-1',
      chapters: { name: 'Toronto', slug: 'toronto' },
    })
    mockModule.__mockUpdateSuccess() // status update
    mockModule.__mockEventFound({ rwgps_id: '12345678' }) // route lookup
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

  it.each(['cancelled', 'completed'] as const)(
    'refuses to move a draft to %s without touching the database',
    async (target) => {
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

      const result = await updateEventStatus('event-1', target)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Drafts can only be published (or deleted)')
      const updateCalls = mockModule.__calls.filter(
        (c) => c.table === 'events' && c.method === 'update'
      )
      expect(updateCalls).toHaveLength(0)
      const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
      expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
    }
  )

  it('refuses to move a draft to cancelled without deleting results', async () => {
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

    const result = await updateEventStatus('event-1', 'cancelled')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Drafts can only be published (or deleted)')

    const deleteCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'delete'
    )
    expect(deleteCalls).toHaveLength(0)

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

  describe('transition table', () => {
    const ALL: EventStatus[] = ['draft', 'scheduled', 'completed', 'cancelled', 'submitted']
    const others = (from: EventStatus) => ALL.filter((to) => to !== from)
    // 'submitted' is in the table (completed -> submitted) but only
    // submitEventResults may perform it, because it also sends the ACP email.
    // updateEventStatus refuses it as a target, so it is tested separately.
    const tablePairs = ALL.flatMap((from) =>
      EVENT_STATUS_TRANSITIONS[from].map((to) => [from, to] as const)
    )
    const allowed = tablePairs.filter(([, to]) => to !== 'submitted')
    const submitOnly = tablePairs.filter(([, to]) => to === 'submitted')
    const forbidden = ALL.flatMap((from) =>
      others(from)
        .filter((to) => !EVENT_STATUS_TRANSITIONS[from].includes(to))
        .map((to) => [from, to] as const)
    )

    function eventIn(status: EventStatus) {
      mockModule.__mockEventFound({
        id: 'event-1',
        name: 'Table Event',
        event_date: `${CURRENT_SEASON}-06-15`,
        distance_km: 200,
        chapter_id: 'chapter-1',
        event_type: 'brevet',
        status,
        erw_event_id: null,
        slug: 'table-event-200km',
        description: null,
        start_time: null,
        route_id: null,
        chapters: { name: 'Toronto', slug: 'toronto' },
      })
    }

    const writes = () =>
      mockModule.__calls.filter(
        (c) =>
          (c.table === 'events' && c.method === 'update') ||
          (c.table === 'results' && c.method === 'delete')
      )

    it('covers every ordered pair of distinct statuses exactly once', () => {
      expect(allowed.length + submitOnly.length + forbidden.length).toBe(
        ALL.length * (ALL.length - 1)
      )
      expect(submitOnly).toEqual([['completed', 'submitted']])
    })

    it('refuses completed -> submitted: only Submit Results may submit an event', async () => {
      eventIn('completed')

      const result = await updateEventStatus('event-1', 'submitted')

      expect(result).toEqual({ success: false, error: 'Use Submit Results to submit an event' })
      expect(writes()).toEqual([])
    })

    it.each(forbidden)('refuses %s -> %s before any update or results delete', async (from, to) => {
      eventIn(from)

      const result = await updateEventStatus('event-1', to)

      expect(result.success).toBe(false)
      expect(writes()).toEqual([])
      const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
      expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
    })

    it('names both states when refusing a non-draft transition', async () => {
      eventIn('cancelled')

      const result = await updateEventStatus('event-1', 'completed')

      expect(result).toEqual({
        success: false,
        error: 'Cannot change event status from cancelled to completed',
      })
    })

    it('refuses submitted -> cancelled without deleting the filed results', async () => {
      eventIn('submitted')

      const result = await updateEventStatus('event-1', 'cancelled')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot change event status from submitted to cancelled')
      const deleteCalls = mockModule.__calls.filter(
        (c) => c.table === 'results' && c.method === 'delete'
      )
      expect(deleteCalls).toHaveLength(0)
    })

    it.each(allowed)('allows %s -> %s and writes the new status', async (from, to) => {
      eventIn(from)

      const result = await updateEventStatus('event-1', to)

      expect(result.success).toBe(true)
      const statusUpdate = mockModule.__calls.find(
        (c) =>
          c.table === 'events' &&
          c.method === 'update' &&
          (c.args?.[0] as { status?: string } | undefined)?.status === to
      )
      expect(statusUpdate).toBeDefined()
    })

    it('un-cancels (cancelled -> scheduled) without deleting results', async () => {
      eventIn('cancelled')

      const result = await updateEventStatus('event-1', 'scheduled')

      expect(result.success).toBe(true)
      expect(
        mockModule.__calls.filter((c) => c.table === 'results' && c.method === 'delete')
      ).toHaveLength(0)
    })

    it.each(ALL)('treats %s -> same status as a no-op success with no writes', async (status) => {
      eventIn(status)

      const result = await updateEventStatus('event-1', status, { description: 'ignored' })

      expect(result).toEqual({ success: true })
      expect(writes()).toEqual([])
      const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
      expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
      const { createErwEvent, deleteErwEvent } = await import('@/lib/erw/client')
      expect(createErwEvent).not.toHaveBeenCalled()
      expect(deleteErwEvent).not.toHaveBeenCalled()
    })
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

  const ACP_SEASON = CURRENT_SEASON + 1

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

  const chapterAdmin = {
    ...superAdmin,
    name: 'Chapter Admin',
    role: 'chapter_admin',
    chapter_id: 'chapter-1',
  }

  const publishedRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'e1',
    name: 'A 200',
    description: null,
    distance_km: 200,
    event_date: `${ACP_SEASON}-05-02`,
    start_time: '07:00',
    slug: 'a-200',
    route_id: 'route-1',
    event_type: 'brevet',
    chapter_id: 'chapter-1',
    chapters: { name: 'Toronto' },
    ...overrides,
  })

  it('rejects a chapter admin publishing another chapter without touching the database', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(chapterAdmin)

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-2')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You can only publish your own chapter')
    expect(mockModule.__calls).toHaveLength(0)
  })

  it('lets a chapter admin publish their own chapter', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(chapterAdmin)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({ data: [publishedRow()], error: null })
    })
    mockModule.__mockEventFound({ rwgps_id: '12345678' }) // route lookup for e1
    mockModule.__mockUpdateSuccess() // ERW column write for e1
    mockModule.__mockEventFound({ slug: 'toronto' }) // chapter revalidation

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 1, erwFailures: 0 })
    }
  })

  it('lets a regular admin publish any chapter', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ ...superAdmin, role: 'admin' })

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-2')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 0, erwFailures: 0 })
    }
  })

  it.each([NaN, 2026.5, Infinity])(
    'rejects a non-integer season (%s) without touching the database',
    async (season) => {
      vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)

      const result = await publishSeasonDrafts(season, 'chapter-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid season')
      expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
    }
  )

  it('rejects an empty chapter id without touching the database', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)

    const result = await publishSeasonDrafts(ACP_SEASON, '')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid chapter')
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('publishes drafts of one chapter inside the ACP season window and syncs each to ERW', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)
    // UPDATE ... RETURNING rows (resolved via `then`)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({
        data: [
          publishedRow({ event_date: `${ACP_SEASON - 1}-11-08` }),
          publishedRow({
            id: 'e2',
            name: 'B Perm',
            start_time: null,
            slug: 'b-perm',
            event_type: 'permanent',
          }),
        ],
        error: null,
      })
    })
    mockModule.__mockEventFound({ rwgps_id: '12345678' }) // route lookup for e1
    mockModule.__mockUpdateSuccess() // ERW column write for e1
    mockModule.__mockEventFound({ slug: 'toronto' }) // chapter revalidation

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 2, erwFailures: 0 })
    }

    const filterCalls = (method: string) =>
      mockModule.__calls
        .filter((c) => c.table === 'events' && c.method === method)
        .map((c) => c.args)
    expect(filterCalls('eq')).toEqual(
      expect.arrayContaining([
        ['status', 'draft'],
        ['chapter_id', 'chapter-1'],
      ])
    )
    expect(filterCalls('eq').some((args) => args?.[0] === 'season')).toBe(false)
    expect(filterCalls('gte')).toContainEqual(['event_date', `${ACP_SEASON - 1}-11-01`])
    expect(filterCalls('lte')).toContainEqual(['event_date', `${ACP_SEASON}-10-31`])

    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    expect(mockCreateErw).toHaveBeenCalledTimes(1) // permanent skipped
    expect(mockCreateErw).toHaveBeenCalledWith(expect.objectContaining({ slug: 'a-200' }))

    const auditInsert = mockModule.__calls.find(
      (c) => c.table === 'audit_logs' && c.method === 'insert'
    )
    expect(auditInsert?.args?.[0]).toEqual(
      expect.objectContaining({
        description: `Published 2 draft events for the ${ACP_SEASON} season (Toronto)`,
      })
    )
  })

  it('publishes a routeless draft without creating it on ERW', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({ data: [publishedRow({ route_id: null })], error: null })
    })
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 1, erwFailures: 0 })
    }
    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    expect(mockCreateErw).not.toHaveBeenCalled()
  })

  it('counts ERW failures without failing the publish', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(superAdmin)
    mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
      resolve({ data: [publishedRow({ start_time: null })], error: null })
    })
    const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
    vi.mocked(mockCreateErw).mockResolvedValueOnce({ success: false, error: 'boom' })
    mockModule.__mockEventFound({ rwgps_id: '12345678' }) // route lookup
    mockModule.__mockEventFound({ slug: 'toronto' })

    const result = await publishSeasonDrafts(ACP_SEASON, 'chapter-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ published: 1, erwFailures: 1 })
    }
  })
})
