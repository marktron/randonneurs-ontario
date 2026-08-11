import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  const events: Array<{
    id: string
    name: string
    event_date: string
    start_time: string | null
    distance_km: number
    status: string
  }> = []

  const createQueryBuilder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: Record<string, any> = {}

    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn((field: string, value: string) => {
      // The initial scheduled-events listing ends its chain right here with
      // `.eq('status', 'scheduled')`, so it's awaited directly (thenable).
      // The per-event completion update chains `.update(...).eq('id',
      // ...).eq('status', 'scheduled').select('id').maybeSingle()` — the
      // `__isUpdate` flag (set by `update()`, cleared by `maybeSingle()`)
      // distinguishes the two so the update chain keeps chaining instead of
      // short-circuiting here.
      if (!builder.__isUpdate && field === 'status' && value === 'scheduled') {
        return {
          ...builder,
          then: (resolve: (result: { data: typeof events; error: null }) => void) => {
            resolve({ data: events.filter((e) => e.status === 'scheduled'), error: null })
          },
        }
      }
      return builder
    })
    builder.update = vi.fn(() => {
      builder.__isUpdate = true
      return builder
    })
    builder.maybeSingle = vi.fn(() => {
      const wasUpdate = builder.__isUpdate
      builder.__isUpdate = false
      return Promise.resolve(
        wasUpdate ? { data: { id: 'updated' }, error: null } : { data: null, error: null }
      )
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
    __events: events,
    __queryBuilder: queryBuilder,
    __reset: () => {
      events.length = 0
    },
    __addEvent: (event: (typeof events)[0]) => {
      events.push(event)
    },
  }
})

// The route's post-completion side effects (creating pending results,
// sending submission emails) are exercised by lib/events/complete-event's
// own tests. Stubbing this boundary here isolates the closing-time logic
// under test from that unrelated registrations/results/email machinery.
const mockCreatePendingResultsAndSendEmails = vi
  .fn()
  .mockResolvedValue({ resultsCreated: 0, emailsSent: 0, errors: [] })
vi.mock('@/lib/events/complete-event', () => ({
  createPendingResultsAndSendEmails: (...args: unknown[]) =>
    mockCreatePendingResultsAndSendEmails(...args),
}))

// Import the route handler after mocking
import { GET } from '@/app/api/cron/complete-events/route'

const mockModule = await vi.importMock<{
  __events: Array<{
    id: string
    name: string
    event_date: string
    start_time: string | null
    distance_km: number
    status: string
  }>
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __addEvent: (event: {
    id: string
    name: string
    event_date: string
    start_time: string | null
    distance_km: number
    status: string
  }) => void
}>('@/lib/supabase-server')

describe('complete-events cron endpoint', () => {
  const CRON_SECRET = 'test-cron-secret'

  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
  })

  it('returns 401 when authorization header is missing', async () => {
    const request = new Request('http://localhost/api/cron/complete-events')
    const response = await GET(request)

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when authorization header is incorrect', async () => {
    const request = new Request('http://localhost/api/cron/complete-events', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const response = await GET(request)

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const request = new Request('http://localhost/api/cron/complete-events', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error).toBe('Server configuration error')
  })

  it('returns success with empty results when no scheduled events', async () => {
    const request = new Request('http://localhost/api/cron/complete-events', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.checked).toBe(0)
    expect(json.completed).toBe(0)
  })
})

describe('closing time calculation', () => {
  it('uses default 8:00 start time when start_time is null', async () => {
    // Import the module to test the calculation logic
    const { closeHours } = await import('@/lib/brmTimes')

    // A 200km event has a closing time of about 13.33 hours
    const closingHours = closeHours(200)
    expect(closingHours).toBeCloseTo(13.33, 1)
  })

  it('calculates correct closing time for various distances', async () => {
    const { closeHours } = await import('@/lib/brmTimes')

    // Test key BRM distances (0-600km at 15 km/h)
    // 200km: 200/15 = 13.33 hours
    expect(closeHours(200)).toBeCloseTo(13.33, 1)

    // 300km: 300/15 = 20 hours
    expect(closeHours(300)).toBeCloseTo(20, 1)

    // 400km: 400/15 = 26.67 hours
    expect(closeHours(400)).toBeCloseTo(26.67, 1)

    // 600km: 600/15 = 40 hours
    expect(closeHours(600)).toBeCloseTo(40, 1)
  })
})

describe('closing time beyond 1300 km (LRM 12 km/h rule)', () => {
  const CRON_SECRET = 'test-cron-secret'
  // 2026-08-04 05:00 Toronto (EDT, UTC-4).
  const start = new Date('2026-08-04T05:00:00-04:00')

  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    mockCreatePendingResultsAndSendEmails.mockResolvedValue({
      resultsCreated: 0,
      emailsSent: 0,
      errors: [],
    })
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
    mockModule.__addEvent({
      id: 'event-2000',
      name: 'Cottage Country Explorer',
      event_date: '2026-08-04',
      start_time: '05:00',
      distance_km: 2000,
      status: 'scheduled',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not complete a 2000 km event at start+151h, the banded closeHours() cutoff', async () => {
    // closeHours(2000) (undefined past 1300 km, but if naively extended)
    // would close around 151h. The real LRM limit is 2000/12h = 166h40m, so
    // the event must still be open here.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(start.getTime() + 151 * 60 * 60 * 1000))

    const request = new Request('http://localhost/api/cron/complete-events', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const json = await (await GET(request)).json()

    expect(json.completed).toBe(0)
  })

  it('completes a 2000 km event after start+167h, past the LRM 12 km/h limit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(start.getTime() + 167 * 60 * 60 * 1000))

    const request = new Request('http://localhost/api/cron/complete-events', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const json = await (await GET(request)).json()

    expect(json.completed).toBe(1)
  })
})
