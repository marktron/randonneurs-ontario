import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before imports
vi.mock('@/lib/supabase-server', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = ['select', 'eq', 'insert', 'update', 'single']

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ error: null }),
          remove: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi
            .fn()
            .mockReturnValue({ data: { publicUrl: 'https://example.com/file.jpg' } }),
        })),
      },
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
      queryBuilder.single.mockReset()
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
  }
})

import {
  getResultByToken,
  submitRiderResult,
  getRiderUpcomingEvents,
  getChapterUpcomingEvents,
} from '@/lib/actions/rider-results'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockResultFound: (result: unknown) => void
  __mockResultNotFound: () => void
  __mockUpdateSuccess: () => void
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
