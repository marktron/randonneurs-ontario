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
      builder[method] = vi.fn((...args) => {
        calls.push({ table: currentTable, method, args })
        return builder
      })
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
  requireAdmin: vi.fn().mockResolvedValue({
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

vi.mock('@/lib/memberships/service', () => ({
  getMembershipForRider: vi.fn(),
  isTrialUsed: vi.fn(),
}))

// Import after mocks
import {
  createResult,
  updateResult,
  deleteResult,
  createBulkResults,
  addRegistration,
  revalidateMembership,
} from '@/lib/actions/results'
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'

const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
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

  it('revalidates the permanent results path for permanent events', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    // Permanent event stored under a chapter (e.g. toronto) but with event_type='permanent'
    mockModule.__mockResultFound({
      event_id: 'event-1',
      season: 2026,
      event_type: 'permanent',
      chapters: { slug: 'toronto' },
    })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'finished',
      finishTime: '10:00',
      season: 2026,
      distanceKm: 200,
    })

    expect(result.success).toBe(true)

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/results/2026/permanent')
  })

  it('revalidates the fleche results path for fleche events', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      season: 2026,
      event_type: 'fleche',
      chapters: { slug: 'toronto' },
    })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'finished',
      finishTime: '24:00',
      season: 2026,
      distanceKm: 360,
    })

    expect(result.success).toBe(true)

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/results/2026/fleche')
  })

  it('revalidates result cache tags with immediate expiration profile', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    mockModule.__mockResultFound({
      event_id: 'event-1',
      season: 2026,
      event_type: 'brevet',
      chapters: { slug: 'toronto' },
    })

    const result = await createResult({
      eventId: 'event-1',
      riderId: 'rider-1',
      status: 'finished',
      finishTime: '13:30',
      season: 2026,
      distanceKm: 200,
    })

    expect(result.success).toBe(true)

    const { revalidateTag } = await import('next/cache')
    // The second arg 'max' uses the max cache-life profile (30-day revalidate,
    // 1-year expire) and does NOT force immediate invalidation. Only a profile
    // with expire: 0 (or no profile) triggers hard path revalidation in Next 16.
    const calls = vi.mocked(revalidateTag).mock.calls
    const resultsCall = calls.find((c) => c[0] === 'results')
    expect(resultsCall, 'revalidateTag was not called with "results"').toBeDefined()
    expect(resultsCall![1]).toEqual({ expire: 0 })
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

    // Verify insert was called on the results table
    const insertCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'insert'
    )
    expect(insertCalls).toHaveLength(1)

    const insertData = insertCalls[0].args![0] as Record<string, unknown>
    expect(insertData).toMatchObject({
      event_id: 'event-1',
      rider_id: 'rider-1',
      status: 'finished',
      finish_time: '13:30',
      season: 2025,
      distance_km: 200,
    })

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith(expect.stringContaining('/admin/events/'))
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

    // Verify insert was called on the results table
    const insertCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'insert'
    )
    expect(insertCalls).toHaveLength(1)

    const insertData = insertCalls[0].args![0] as Record<string, unknown>
    expect(insertData.status).toBe('dnf')
    expect(insertData.finish_time).toBeNull()
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

    // Verify update was called on the results table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)

    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData).toMatchObject({
      status: 'finished',
      finish_time: '14:00',
    })

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
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

    // Verify update was called on the results table
    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)

    const updateData = updateCalls[0].args![0] as Record<string, unknown>
    expect(updateData.finish_time).toBe('14:00')
    expect(updateData.status).toBeUndefined()
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

    // Verify delete was called on the results table
    const deleteCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'delete'
    )
    expect(deleteCalls).toHaveLength(1)

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
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

describe('addRegistration', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when registration already exists', async () => {
    mockModule.__mockExistingResult({ id: 'reg-1' })

    const result = await addRegistration({
      eventId: 'event-1',
      riderId: 'rider-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('This rider is already registered for this event')
  })

  it('creates registration successfully when no duplicate', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()

    const result = await addRegistration({
      eventId: 'event-1',
      riderId: 'rider-1',
    })

    expect(result.success).toBe(true)

    // Verify insert was called on the registrations table
    const insertCalls = mockModule.__calls.filter(
      (c) => c.table === 'registrations' && c.method === 'insert'
    )
    expect(insertCalls).toHaveLength(1)
  })

  it('handles database errors', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertError({
      code: '23503',
      message: 'foreign key violation',
    })

    const result = await addRegistration({
      eventId: 'invalid-event',
      riderId: 'rider-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // /register/[slug] is cached (ISR + tags), so an admin-added registration must
  // bust the same tags the public registration flow does — otherwise the rider
  // never shows up in the "Registered" list until the hourly revalidate.
  it('busts the registration and event caches so the public event page updates', async () => {
    mockModule.__mockNoExistingResult()
    mockModule.__mockInsertSuccess()
    // Post-insert lookups: event first, then rider (for the audit log).
    mockModule.__mockResultFound({ name: 'Spring 200', slug: 'spring-200' })
    mockModule.__mockResultFound({ first_name: 'Ada', last_name: 'Lovelace' })

    const result = await addRegistration({
      eventId: 'event-1',
      riderId: 'rider-1',
    })

    expect(result.success).toBe(true)

    const { revalidateTag, revalidatePath } = await import('next/cache')
    const calls = vi.mocked(revalidateTag).mock.calls

    const registrationsCall = calls.find((c) => c[0] === 'registrations')
    expect(registrationsCall, 'revalidateTag was not called with "registrations"').toBeDefined()
    expect(registrationsCall![1]).toEqual({ expire: 0 })

    const eventsCall = calls.find((c) => c[0] === 'events')
    expect(eventsCall, 'revalidateTag was not called with "events"').toBeDefined()
    expect(eventsCall![1]).toEqual({ expire: 0 })

    const eventSlugCall = calls.find((c) => c[0] === 'event-spring-200')
    expect(eventSlugCall, 'revalidateTag was not called with "event-spring-200"').toBeDefined()
    expect(eventSlugCall![1]).toEqual({ expire: 0 })

    expect(revalidatePath).toHaveBeenCalledWith('/register/spring-200')
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

    // Verify insert was called on the results table
    const insertCalls = mockModule.__calls.filter(
      (c) => c.table === 'results' && c.method === 'insert'
    )
    expect(insertCalls).toHaveLength(1)
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

describe('revalidateMembership', () => {
  const mockGetMembership = vi.mocked(getMembershipForRider)
  const mockIsTrialUsed = vi.mocked(isTrialUsed)

  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when registration not found', async () => {
    mockModule.__mockResultNotFound()

    const result = await revalidateMembership('nonexistent-reg')

    expect(result.success).toBe(false)
  })

  it('returns error when registration status is not incomplete', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'registered',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Frank', last_name: 'Fake' },
      events: { chapter_id: 'ch-1' },
    })

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('missing membership')
  })

  it('returns membershipFound: false when CCN has no membership', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Frank', last_name: 'Fake' },
      events: { chapter_id: 'ch-1' },
    })
    mockGetMembership.mockResolvedValueOnce({ found: false })

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(true)
    expect(result.data?.membershipFound).toBe(false)
    expect(mockGetMembership).toHaveBeenCalledWith('rider-1', 'Frank', 'Fake', 'ch-1')
  })

  it('updates registration status when membership found', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Frank', last_name: 'Fake' },
      events: { chapter_id: 'ch-1' },
    })
    mockGetMembership.mockResolvedValueOnce({
      found: true,
      membershipId: 12345,
      type: 'Individual Membership',
    })
    mockModule.__mockUpdateSuccess()

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(true)
    expect(result.data?.membershipFound).toBe(true)

    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'registrations' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].args![0]).toMatchObject({ status: 'registered' })
  })

  it('keeps registration incomplete and reports trialUsed when rider is still Trial Member with used trial', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Tara', last_name: 'Trial' },
      events: { chapter_id: 'ch-1' },
    })
    mockGetMembership.mockResolvedValueOnce({
      found: true,
      membershipId: 999,
      type: 'Trial Member',
    })
    mockIsTrialUsed.mockResolvedValueOnce(true)

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(true)
    expect(result.data?.membershipFound).toBe(true)
    expect(result.data?.trialUsed).toBe(true)

    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'registrations' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(0)
  })

  it('promotes registration to registered when rider upgraded from Trial to non-Trial type', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Uri', last_name: 'Upgrade' },
      events: { chapter_id: 'ch-1' },
    })
    mockGetMembership.mockResolvedValueOnce({
      found: true,
      membershipId: 12345,
      type: 'Individual Membership',
    })
    mockModule.__mockUpdateSuccess()

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(true)
    expect(result.data?.membershipFound).toBe(true)
    expect(result.data?.trialUsed).toBeFalsy()
    expect(mockIsTrialUsed).not.toHaveBeenCalled()

    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'registrations' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].args![0]).toMatchObject({ status: 'registered' })
  })

  it('promotes registration to registered when rider is still Trial Member but trial is no longer used', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Tara', last_name: 'Trial' },
      events: { chapter_id: 'ch-1' },
    })
    mockGetMembership.mockResolvedValueOnce({
      found: true,
      membershipId: 999,
      type: 'Trial Member',
    })
    mockIsTrialUsed.mockResolvedValueOnce(false)
    mockModule.__mockUpdateSuccess()

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(true)
    expect(result.data?.membershipFound).toBe(true)
    expect(result.data?.trialUsed).toBeFalsy()

    const updateCalls = mockModule.__calls.filter(
      (c) => c.table === 'registrations' && c.method === 'update'
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].args![0]).toMatchObject({ status: 'registered' })
  })

  it('returns error when CCN API fails', async () => {
    mockModule.__mockResultFound({
      id: 'reg-1',
      status: 'incomplete: membership',
      rider_id: 'rider-1',
      event_id: 'event-1',
      riders: { first_name: 'Frank', last_name: 'Fake' },
      events: { chapter_id: null },
    })
    mockGetMembership.mockRejectedValueOnce(new Error('CCN API timed out after 10s'))

    const result = await revalidateMembership('reg-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('CCN API timed out after 10s')
  })
})
