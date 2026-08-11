import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before imports
vi.mock('@/lib/supabase-server', () => {
  // Track all requests for assertions
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []
  let currentTable = ''

  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = ['select', 'eq', 'insert', 'update', 'single', 'maybeSingle']

    methods.forEach((method) => {
      builder[method] = vi.fn((...args) => {
        calls.push({ table: currentTable, method, args })
        return builder
      })
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  const storageMock = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.jpg' } }),
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/signed-upload-url',
        token: 'signed-token',
        path: 'mock-path',
      },
      error: null,
    }),
  }

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn((table: string) => {
        currentTable = table
        return queryBuilder
      }),
      storage: {
        from: vi.fn(() => storageMock),
      },
    })),
    __calls: calls,
    __queryBuilder: queryBuilder,
    __storage: storageMock,
    __reset: () => {
      calls.length = 0
      queryBuilder.single.mockReset()
      queryBuilder.maybeSingle.mockReset()
      // Default: no registration found for the digital-card check-in lookup
      // in getResultByToken, so usedDigitalCard defaults to false unless a
      // test overrides it with __mockRegistration(...).
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
      storageMock.upload.mockClear()
      storageMock.remove.mockClear()
      storageMock.createSignedUploadUrl.mockClear()
      storageMock.createSignedUploadUrl.mockResolvedValue({
        data: {
          signedUrl: 'https://example.com/signed-upload-url',
          token: 'signed-token',
          path: 'mock-path',
        },
        error: null,
      })
    },
    __mockResultFound: (result: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: result, error: null })
    },
    __mockResultNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockUpdateSuccess: () => {
      queryBuilder.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
    },
    // Controls the registrations lookup used by getResultByToken to derive
    // usedDigitalCard and the pre-ride start. checkinIds: null means no
    // registration row was found; an array (possibly empty) means a
    // registration was found with that many control_checkins. preRide
    // defaults to no pre-ride (both fields null).
    __mockRegistration: (
      checkinIds: string[] | null,
      preRide: { pre_ride_date: string | null; pre_ride_start_time: string | null } = {
        pre_ride_date: null,
        pre_ride_start_time: null,
      }
    ) => {
      queryBuilder.maybeSingle.mockResolvedValueOnce({
        data:
          checkinIds === null
            ? null
            : {
                id: 'reg-1',
                control_checkins: checkinIds.map((id) => ({ id })),
                ...preRide,
              },
        error: null,
      })
    },
    __mockRegistrationLookupError: () => {
      queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'registration lookup failed' },
      })
    },
  }
})

import {
  getResultByToken,
  submitRiderResult,
  getRiderUpcomingEvents,
  getChapterUpcomingEvents,
  getUpcomingEventsByEventId,
  createResultUploadUrl,
  confirmResultUpload,
} from '@/lib/actions/rider-results'

const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __storage: {
    upload: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    getPublicUrl: ReturnType<typeof vi.fn>
    createSignedUploadUrl: ReturnType<typeof vi.fn>
  }
  __reset: () => void
  __mockResultFound: (result: unknown) => void
  __mockResultNotFound: () => void
  __mockUpdateSuccess: () => void
  __mockRegistration: (
    checkinIds: string[] | null,
    preRide?: { pre_ride_date: string | null; pre_ride_start_time: string | null }
  ) => void
  __mockRegistrationLookupError: () => void
}>('@/lib/supabase-server')

describe('getResultByToken', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty token', async () => {
    const result = await getResultByToken('')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid submission token')
  })

  it('returns error when result not found', async () => {
    mockModule.__mockResultNotFound()

    const result = await getResultByToken('invalid-token')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Result not found or invalid token')
  })

  it('returns result data when token is valid', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      status: 'pending',
      finish_time: null,
      gpx_url: null,
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      rider_notes: null,
      submitted_at: null,
      events: {
        id: 'event-1',
        name: 'Test Event',
        event_date: '2025-06-15',
        distance_km: 200,
        status: 'completed',
        chapters: { name: 'Toronto', slug: 'toronto' },
      },
      riders: {
        id: 'rider-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
    })

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.eventName).toBe('Test Event')
    expect(result.data?.riderName).toBe('John Doe')
    expect(result.data?.canSubmit).toBe(true)
    expect(result.data?.chapterSlug).toBe('toronto')
    expect(result.data?.riderId).toBe('rider-1')
  })

  it('returns canSubmit=false when event is submitted', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      status: 'pending',
      finish_time: null,
      gpx_url: null,
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      rider_notes: null,
      submitted_at: null,
      events: {
        id: 'event-1',
        name: 'Test Event',
        event_date: '2025-06-15',
        distance_km: 200,
        status: 'submitted', // Already submitted
        chapters: { name: 'Toronto', slug: 'toronto' },
      },
      riders: {
        id: 'rider-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
    })

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.canSubmit).toBe(false)
  })

  const baseResultRow = {
    id: 'result-1',
    event_id: 'event-1',
    rider_id: 'rider-1',
    status: 'pending',
    finish_time: null,
    gpx_url: null,
    gpx_file_path: null,
    control_card_front_path: null,
    control_card_back_path: null,
    rider_notes: null,
    submitted_at: null,
    events: {
      id: 'event-1',
      name: 'Test Event',
      event_date: '2025-06-15',
      distance_km: 200,
      status: 'completed',
      chapters: { name: 'Toronto', slug: 'toronto' },
    },
    riders: {
      id: 'rider-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
    },
  }

  it('sets usedDigitalCard=true when the registration has a control check-in', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration(['checkin-1'])

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.usedDigitalCard).toBe(true)
  })

  it('sets usedDigitalCard=false when the registration has no check-ins', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration([])

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.usedDigitalCard).toBe(false)
  })

  it('sets usedDigitalCard=false when there is no registration row', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration(null)

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.usedDigitalCard).toBe(false)
  })

  it('sets usedDigitalCard=false and still succeeds when the check-in lookup errors', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistrationLookupError()

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.usedDigitalCard).toBe(false)
  })

  it('returns the registration pre-ride start when the rider had an approved pre-ride', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration([], { pre_ride_date: '2026-07-25', pre_ride_start_time: '05:00' })

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.preRideDate).toBe('2026-07-25')
    expect(result.data?.preRideStartTime).toBe('05:00')
  })

  it('returns null pre-ride fields when the registration has no pre-ride', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration([])

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.preRideDate).toBeNull()
    expect(result.data?.preRideStartTime).toBeNull()
  })

  it('returns null pre-ride fields when there is no registration row (admin-created result)', async () => {
    mockModule.__mockResultFound(baseResultRow)
    mockModule.__mockRegistration(null)

    const result = await getResultByToken('valid-token')

    expect(result.success).toBe(true)
    expect(result.data?.preRideDate).toBeNull()
    expect(result.data?.preRideStartTime).toBeNull()
  })
})

describe('submitRiderResult', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty token', async () => {
    const result = await submitRiderResult({
      token: '',
      status: 'finished',
      finishTime: '13:30',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid submission token')
  })

  it('returns error for invalid status', async () => {
    const result = await submitRiderResult({
      token: 'valid-token',
      status: 'invalid' as 'finished',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid status')
  })

  it('returns error when finished without time', async () => {
    const result = await submitRiderResult({
      token: 'valid-token',
      status: 'finished',
      finishTime: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Finish time is required for finished rides')
  })

  it('returns error for invalid time format', async () => {
    const result = await submitRiderResult({
      token: 'valid-token',
      status: 'finished',
      finishTime: '13:3', // Invalid format
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid finish time format. Use HH:MM (e.g., 13:30 or 105:45)')
  })

  it('accepts valid finish time formats', async () => {
    // Mock result found for token validation
    mockModule.__mockResultFound({
      id: 'result-1',
      events: { status: 'completed' },
    })
    mockModule.__mockUpdateSuccess()

    // Test various valid formats
    const validTimes = ['1:30', '13:30', '105:45']

    for (const time of validTimes) {
      mockModule.__mockResultFound({
        id: 'result-1',
        events: { status: 'completed' },
      })

      const result = await submitRiderResult({
        token: 'valid-token',
        status: 'finished',
        finishTime: time,
      })

      // The validation should pass (even if the update fails due to mocking)
      expect(result.error).not.toBe('Invalid finish time format. Use HH:MM (e.g., 13:30 or 105:45)')
    }
  })

  it('allows DNF without finish time', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      events: { status: 'completed' },
    })
    mockModule.__mockUpdateSuccess()

    const result = await submitRiderResult({
      token: 'valid-token',
      status: 'dnf',
    })

    // Should not fail validation
    expect(result.error).not.toBe('Finish time is required for finished rides')

    // Verify update was attempted on the query builder
    expect(mockModule.__queryBuilder.update).toHaveBeenCalled()
  })

  it('revalidates the results cache after a successful submission', async () => {
    // 1. verify-token lookup on results
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      events: { status: 'completed' },
    })
    // 2. update succeeds
    mockModule.__mockUpdateSuccess()
    // 3. revalidateResultsTags fetches the event for season/chapter/event_type
    mockModule.__mockResultFound({
      season: 2026,
      event_type: 'brevet',
      chapters: null,
    })

    const result = await submitRiderResult({
      token: 'valid-token',
      status: 'finished',
      finishTime: '13:30',
    })

    expect(result.success).toBe(true)

    // The public results pages (getChapterResults, getRiderResults,
    // getRouteResults) are cached under the 'results' tag. A rider's own
    // submission must bust it or their result never appears publicly.
    const { revalidateTag } = await import('next/cache')
    expect(revalidateTag).toHaveBeenCalledWith('results', { expire: 0 })
  })
})

describe('getRiderUpcomingEvents', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty rider ID', async () => {
    const result = await getRiderUpcomingEvents('')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid rider ID')
  })
})

describe('getChapterUpcomingEvents', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty chapter slug', async () => {
    const result = await getChapterUpcomingEvents('', 'rider-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid chapter')
  })
})

describe('getUpcomingEventsByEventId', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty event ID', async () => {
    const result = await getUpcomingEventsByEventId('')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid event')
  })
})

describe('createResultUploadUrl', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty token', async () => {
    const result = await createResultUploadUrl({
      token: '',
      fileType: 'gpx',
      fileName: 'ride.gpx',
      contentType: 'application/gpx+xml',
      fileSize: 1000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid submission token')
  })

  it('rejects oversized image files (> 10 MB)', async () => {
    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'control_card_front',
      fileName: 'card.jpg',
      contentType: 'image/jpeg',
      fileSize: 11 * 1024 * 1024, // 11MB
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/file too large/i)
  })

  it('accepts large GPX files up to the 100 MB GPX ceiling', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      events: { status: 'completed' },
    })

    // A 50 MB GPX file — roughly a 600 km brevet at 1 Hz recording.
    // Images are still capped at 10 MB; GPX goes up to 100 MB.
    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'gpx',
      fileName: 'long-brevet.gpx',
      contentType: 'application/gpx+xml',
      fileSize: 50 * 1024 * 1024,
    })

    expect(result.success).toBe(true)
    expect(result.data?.path).toMatch(/^event-1\/rider-1\/gpx-/)
  })

  it('rejects GPX files larger than 100 MB', async () => {
    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'gpx',
      fileName: 'absurd.gpx',
      contentType: 'application/gpx+xml',
      fileSize: 101 * 1024 * 1024, // 101 MB
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/file too large/i)
  })

  it('rejects invalid GPX content types', async () => {
    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'gpx',
      fileName: 'ride.exe',
      contentType: 'application/octet-stream',
      fileSize: 1000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid file type/i)
  })

  it('rejects invalid image content types for control card', async () => {
    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'control_card_back',
      fileName: 'card.gif',
      contentType: 'image/gif',
      fileSize: 1000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid file type/i)
  })

  it('returns error when token does not match a result', async () => {
    mockModule.__mockResultNotFound()

    const result = await createResultUploadUrl({
      token: 'invalid-token',
      fileType: 'gpx',
      fileName: 'ride.gpx',
      contentType: 'application/gpx+xml',
      fileSize: 1000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Result not found or invalid token')
  })

  it('returns error if event already submitted to ACP', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      events: { status: 'submitted' },
    })

    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'gpx',
      fileName: 'ride.gpx',
      contentType: 'application/gpx+xml',
      fileSize: 1000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already been submitted/i)
  })

  it('returns a signed upload URL for a valid request', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      events: { status: 'completed' },
    })

    const result = await createResultUploadUrl({
      token: 'valid-token',
      fileType: 'control_card_front',
      fileName: 'card.jpg',
      contentType: 'image/jpeg',
      fileSize: 2 * 1024 * 1024,
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.signedUrl).toBe('https://example.com/signed-upload-url')
    expect(result.data?.uploadToken).toBe('signed-token')
    expect(result.data?.path).toMatch(/^event-1\/rider-1\/control_card_front-/)
    expect(result.data?.publicUrl).toBe('https://example.com/file.jpg')

    // Verify the signed URL was requested with the generated path
    expect(mockModule.__storage.createSignedUploadUrl).toHaveBeenCalledTimes(1)
  })
})

describe('confirmResultUpload', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error for empty token', async () => {
    const result = await confirmResultUpload({
      token: '',
      fileType: 'gpx',
      path: 'event-1/rider-1/gpx-1.gpx',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid submission token')
  })

  it('returns error when token does not match a result', async () => {
    mockModule.__mockResultNotFound()

    const result = await confirmResultUpload({
      token: 'invalid-token',
      fileType: 'gpx',
      path: 'event-1/rider-1/gpx-1.gpx',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Result not found or invalid token')
  })

  it('rejects paths that do not match event/rider scope', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      events: { status: 'completed' },
    })

    const result = await confirmResultUpload({
      token: 'valid-token',
      fileType: 'gpx',
      // Path is for a different event/rider
      path: 'other-event/other-rider/gpx-1.gpx',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid file path/i)
  })

  it('updates the database with the file path on success', async () => {
    mockModule.__mockResultFound({
      id: 'result-1',
      event_id: 'event-1',
      rider_id: 'rider-1',
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      events: { status: 'completed' },
    })
    mockModule.__mockUpdateSuccess()

    const result = await confirmResultUpload({
      token: 'valid-token',
      fileType: 'gpx',
      path: 'event-1/rider-1/gpx-12345.gpx',
    })

    expect(result.success).toBe(true)
    expect(mockModule.__queryBuilder.update).toHaveBeenCalled()
  })
})
