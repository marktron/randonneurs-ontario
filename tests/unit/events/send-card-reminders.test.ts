import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSupabaseAdmin, mockSendCardReminderEmail, mockIsEmailConfigured, mockLogError } =
  vi.hoisted(() => ({
    mockSupabaseAdmin: vi.fn(),
    mockSendCardReminderEmail: vi.fn(),
    mockIsEmailConfigured: vi.fn(() => true),
    mockLogError: vi.fn(),
  }))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: mockSupabaseAdmin,
}))

vi.mock('@/lib/errors', () => ({
  logError: mockLogError,
}))

vi.mock('@/lib/email/ses', () => ({
  isEmailConfigured: mockIsEmailConfigured,
}))

vi.mock('@/lib/email/send-card-reminder-email', () => ({
  sendCardReminderEmail: mockSendCardReminderEmail,
}))

import {
  sendCardReminders,
  CARD_REMINDER_LEAD_MS,
  CARD_REMINDER_BATCH_LIMIT,
} from '@/lib/events/send-card-reminders'
import { createTorontoDate, torontoDateString, TORONTO_TZ } from '@/lib/brmTimes'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Fixed reference instant for every fixture: Friday, June 5 2026 at 19:00
 * Toronto. Every date below is derived from it, so nothing expires.
 */
const NOW = createTorontoDate(2026, 5, 5, 19, 0)

/** `HH:MM` in Toronto — the shape `events.start_time` is stored in. */
function torontoTimeString(date: Date): string {
  return date.toLocaleTimeString('en-CA', {
    timeZone: TORONTO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

/** The `event_date` / `start_time` pair for a start `offsetMs` away from NOW. */
function startAt(offsetMs: number): { event_date: string; start_time: string } {
  const at = new Date(NOW.getTime() + offsetMs)
  return { event_date: torontoDateString(at), start_time: torontoTimeString(at) }
}

type Filter = [string, ...unknown[]]

interface RecordedSelect {
  table: string
  columns: string
  filters: Filter[]
}

interface RecordedUpdate {
  table: string
  row: Record<string, unknown>
  filters: Filter[]
}

interface SupabaseOptions {
  registrations?: Record<string, unknown>[]
  registrationsError?: { message: string } | null
  /** Event ids that have at least one row in `event_controls`. */
  controlEventIds?: string[]
  controlsError?: { message: string } | null
  /** Claim outcome per registration id; anything unlisted claims successfully. */
  claims?: Record<string, { data: { id: string } | null; error: { message: string } | null }>
}

/**
 * Hand-rolled Supabase double. Filter methods accumulate onto the recorded
 * call and return the same chain, which is awaitable (like a
 * PostgrestFilterBuilder) and also exposes `maybeSingle()`, so both the
 * candidate query and the claim update resolve through one shape. Recording
 * the whole chain is what lets the tests assert the claim's
 * `.is('card_reminder_sent_at', null)` guard.
 */
function buildSupabase(options: SupabaseOptions) {
  const selects: RecordedSelect[] = []
  const updates: RecordedUpdate[] = []

  function makeChain(filters: Filter[], resolve: () => { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {}
    for (const method of ['eq', 'is', 'in', 'gte', 'order', 'limit', 'select']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        filters.push([method, ...args])
        return chain
      })
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: () => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    return chain
  }

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        const filters: Filter[] = []
        selects.push({ table, columns, filters })
        return makeChain(filters, () => {
          if (table === 'registrations') {
            return {
              data: options.registrations ?? [],
              error: options.registrationsError ?? null,
            }
          }
          if (table === 'event_controls') {
            return {
              data: (options.controlEventIds ?? []).map((event_id) => ({ event_id })),
              error: options.controlsError ?? null,
            }
          }
          throw new Error(`Unexpected select on table: ${table}`)
        })
      }),
      update: vi.fn((row: Record<string, unknown>) => {
        const filters: Filter[] = []
        updates.push({ table, row, filters })
        return makeChain(filters, () => {
          const id = filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string
          return options.claims?.[id] ?? { data: { id }, error: null }
        })
      }),
    })),
  }

  return { client, selects, updates }
}

function makeRegistration(overrides: Record<string, unknown> = {}) {
  const { events: eventOverrides, ...regOverrides } = overrides as {
    events?: Record<string, unknown>
  } & Record<string, unknown>

  return {
    id: 'reg-1',
    event_id: 'event-1',
    management_token: 'tok-1',
    registered_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    pre_ride_date: null,
    pre_ride_start_time: null,
    riders: {
      id: 'rider-1',
      first_name: 'Test',
      last_name: 'Rider',
      email: 'rider@test.com',
    },
    events: {
      id: 'event-1',
      name: 'Test Brevet',
      distance_km: 200,
      event_type: 'brevet',
      status: 'scheduled',
      start_location: 'Toronto',
      chapters: { name: 'Toronto', slug: 'toronto' },
      // Default: the start is exactly the 12 h send point.
      ...startAt(12 * HOUR),
      ...eventOverrides,
    },
    ...regOverrides,
  }
}

/**
 * Installs the double without running the sweep, for the cases that assert a
 * rejection and then inspect what the sweep did (or didn't) touch first.
 */
function installSupabase(options: SupabaseOptions) {
  const supabase = buildSupabase(options)
  mockSupabaseAdmin.mockReturnValue(supabase.client)
  return supabase
}

/** Runs the sweep against one registration and returns the result plus the double. */
async function sweepOne(registration: Record<string, unknown>, options: SupabaseOptions = {}) {
  const supabase = installSupabase({
    registrations: [registration],
    controlEventIds: ['event-1'],
    ...options,
  })
  const result = await sendCardReminders(NOW)
  return { result, supabase }
}

describe('sendCardReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendCardReminderEmail.mockResolvedValue({ sent: true })
    mockIsEmailConfigured.mockReturnValue(true)
  })

  describe('email configuration', () => {
    it('throws before claiming or querying anything when SES is not configured', async () => {
      // The claim is stamped before the send, so running the sweep without SES
      // would mark every in-window rider as reminded and lose the email —
      // unrecoverable without SQL. Throwing rather than reporting is what makes
      // the cron route return 500 and the Actions job go red.
      mockIsEmailConfigured.mockReturnValue(false)
      const supabase = installSupabase({
        registrations: [makeRegistration()],
        controlEventIds: ['event-1'],
      })

      await expect(sendCardReminders(NOW)).rejects.toThrow(
        'AWS SES not configured; skipping card reminder sweep'
      )

      expect(supabase.updates).toHaveLength(0)
      expect(supabase.selects).toHaveLength(0)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })
  })

  describe('candidate query', () => {
    it('filters to registered digital-card riders on unsent, scheduled, card-eligible events', async () => {
      const { supabase } = await sweepOne(makeRegistration())
      const query = supabase.selects.find((s) => s.table === 'registrations')!

      expect(query.columns).toContain('events!inner(')
      expect(query.columns).toContain('management_token')
      expect(query.filters).toEqual(
        expect.arrayContaining([
          ['eq', 'status', 'registered'],
          ['eq', 'brevet_card_type', 'digital'],
          ['is', 'card_reminder_sent_at', null],
          ['eq', 'events.status', 'scheduled'],
          ['in', 'events.event_type', ['brevet', 'populaire', 'permanent']],
        ])
      )
    })

    it('prunes events whose date is more than a day past', async () => {
      const { supabase } = await sweepOne(makeRegistration())
      const query = supabase.selects.find((s) => s.table === 'registrations')!

      expect(query.filters).toContainEqual([
        'gte',
        'events.event_date',
        torontoDateString(new Date(NOW.getTime() - DAY)),
      ])
    })

    it('orders oldest registration first and caps the batch', async () => {
      // `events.event_date` is an embedded column, which PostgREST can't order
      // by at the parent level, so the order is on parent columns. The cap is
      // safe because a row left unswept this hour is still an unsent candidate
      // next hour.
      const { supabase } = await sweepOne(makeRegistration())
      const query = supabase.selects.find((s) => s.table === 'registrations')!

      expect(CARD_REMINDER_BATCH_LIMIT).toBe(500)
      expect(query.filters).toContainEqual(['order', 'registered_at', { ascending: true }])
      expect(query.filters).toContainEqual(['order', 'id', { ascending: true }])
      expect(query.filters).toContainEqual(['limit', CARD_REMINDER_BATCH_LIMIT])
      expect(query.filters).not.toContainEqual(['order', 'events.event_date', { ascending: true }])
    })

    it('throws the query error without sending anything', async () => {
      const supabase = installSupabase({ registrationsError: { message: 'boom' } })

      await expect(sendCardReminders(NOW)).rejects.toThrow(
        'Failed to fetch card reminder candidates: boom'
      )

      expect(supabase.updates).toHaveLength(0)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('throws the controls query error without claiming anything', async () => {
      const supabase = installSupabase({
        registrations: [makeRegistration()],
        controlEventIds: ['event-1'],
        controlsError: { message: 'controls down' },
      })

      await expect(sendCardReminders(NOW)).rejects.toThrow(
        'Failed to fetch event controls: controls down'
      )

      expect(supabase.updates).toHaveLength(0)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('skips the controls query when there are no candidates', async () => {
      mockSupabaseAdmin.mockReturnValue(buildSupabase({ registrations: [] }).client)

      const result = await sendCardReminders(NOW)

      expect(result).toEqual({
        checked: 0,
        sent: 0,
        skipped: {
          notInWindow: 0,
          lateSignup: 0,
          noControls: 0,
          noEmail: 0,
          noToken: 0,
          alreadyClaimed: 0,
        },
        errors: [],
      })
    })
  })

  describe('send window', () => {
    it('leads the rider start by 12 hours', () => {
      expect(CARD_REMINDER_LEAD_MS).toBe(12 * HOUR)
    })

    it('sends when the start is exactly 12 hours away', async () => {
      const { result } = await sweepOne(makeRegistration({ events: startAt(12 * HOUR) }))

      expect(result).toMatchObject({ checked: 1, sent: 1 })
      expect(mockSendCardReminderEmail).toHaveBeenCalledTimes(1)
    })

    it('skips when the start is a minute more than 12 hours away', async () => {
      const { result } = await sweepOne(makeRegistration({ events: startAt(12 * HOUR + MINUTE) }))

      expect(result.sent).toBe(0)
      expect(result.skipped.notInWindow).toBe(1)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('sends when the start is 30 minutes away', async () => {
      const { result } = await sweepOne(makeRegistration({ events: startAt(30 * MINUTE) }))

      expect(result.sent).toBe(1)
    })

    it('skips a start that has already passed', async () => {
      const { result } = await sweepOne(makeRegistration({ events: startAt(-2 * HOUR) }))

      expect(result.sent).toBe(0)
      expect(result.skipped.notInWindow).toBe(1)
    })

    it('skips a start happening exactly now', async () => {
      const { result } = await sweepOne(makeRegistration({ events: startAt(0) }))

      expect(result.sent).toBe(0)
      expect(result.skipped.notInWindow).toBe(1)
    })
  })

  describe('late signups', () => {
    it('skips a rider who registered after the send point', async () => {
      const { result, supabase } = await sweepOne(
        makeRegistration({
          events: startAt(6 * HOUR),
          // Send point was 6 h ago; this signup lands a minute after it.
          registered_at: new Date(NOW.getTime() - 6 * HOUR + MINUTE).toISOString(),
        })
      )

      expect(result.sent).toBe(0)
      expect(result.skipped.lateSignup).toBe(1)
      expect(supabase.updates).toHaveLength(0)
    })

    it('sends to a rider who registered a minute before the send point', async () => {
      const { result } = await sweepOne(
        makeRegistration({
          events: startAt(6 * HOUR),
          registered_at: new Date(NOW.getTime() - 6 * HOUR - MINUTE).toISOString(),
        })
      )

      expect(result.sent).toBe(1)
    })

    it('skips a rider who registered exactly at the send point', async () => {
      const { result } = await sweepOne(
        makeRegistration({
          events: startAt(6 * HOUR),
          registered_at: new Date(NOW.getTime() - 6 * HOUR).toISOString(),
        })
      )

      expect(result.sent).toBe(0)
      expect(result.skipped.lateSignup).toBe(1)
    })

    it('treats a null registered_at as eligible', async () => {
      const { result } = await sweepOne(
        makeRegistration({ events: startAt(6 * HOUR), registered_at: null })
      )

      expect(result.sent).toBe(1)
    })
  })

  describe('pre-rides', () => {
    it('uses the pre-ride start, not the event start, for the window and the email', async () => {
      const preRide = startAt(12 * HOUR)
      const { result } = await sweepOne(
        makeRegistration({
          // The event itself is a week out, so only the pre-ride start is in window.
          events: startAt(7 * DAY),
          pre_ride_date: preRide.event_date,
          pre_ride_start_time: preRide.start_time,
        })
      )

      expect(result.sent).toBe(1)
      expect(mockSendCardReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          riderStart: new Date(NOW.getTime() + 12 * HOUR),
        })
      )
    })

    it('skips a pre-ride whose start has passed even though the event is upcoming', async () => {
      const preRide = startAt(-3 * DAY)
      const { result } = await sweepOne(
        makeRegistration({
          events: startAt(4 * DAY),
          pre_ride_date: preRide.event_date,
          pre_ride_start_time: preRide.start_time,
        })
      )

      expect(result.sent).toBe(0)
      expect(result.skipped.notInWindow).toBe(1)
    })
  })

  describe('eligibility guards', () => {
    it('skips an event with no controls and never claims it', async () => {
      const { result, supabase } = await sweepOne(makeRegistration(), { controlEventIds: [] })

      expect(result.sent).toBe(0)
      expect(result.skipped.noControls).toBe(1)
      expect(supabase.updates).toHaveLength(0)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('skips a rider with no email and never claims the row', async () => {
      const { result, supabase } = await sweepOne(
        makeRegistration({
          riders: {
            id: 'rider-1',
            first_name: 'Test',
            last_name: 'Rider',
            email: null,
          },
        })
      )

      expect(result.sent).toBe(0)
      expect(result.skipped.noEmail).toBe(1)
      expect(result.skipped.noToken).toBe(0)
      expect(supabase.updates).toHaveLength(0)
    })

    it('counts a missing management token separately from a missing email', async () => {
      // Two different problems: a rider with no email address, and a
      // registration whose card link can't be built. Reporting both as
      // `noEmail` sent whoever read the cron response after the wrong thing.
      const { result, supabase } = await sweepOne(makeRegistration({ management_token: null }))

      expect(result.skipped.noToken).toBe(1)
      expect(result.skipped.noEmail).toBe(0)
      expect(supabase.updates).toHaveLength(0)
    })
  })

  describe('claim', () => {
    it('stamps card_reminder_sent_at filtered by id and still-null claim column', async () => {
      const { supabase } = await sweepOne(makeRegistration())

      expect(supabase.updates).toHaveLength(1)
      const claim = supabase.updates[0]
      expect(claim.table).toBe('registrations')
      expect(claim.row).toEqual({ card_reminder_sent_at: NOW.toISOString() })
      expect(claim.filters).toContainEqual(['eq', 'id', 'reg-1'])
      expect(claim.filters).toContainEqual(['is', 'card_reminder_sent_at', null])
    })

    it('counts a lost claim as alreadyClaimed and never sends', async () => {
      const { result } = await sweepOne(makeRegistration(), {
        claims: { 'reg-1': { data: null, error: null } },
      })

      expect(result.sent).toBe(0)
      expect(result.skipped.alreadyClaimed).toBe(1)
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('records a claim error and moves on without sending', async () => {
      const { result } = await sweepOne(makeRegistration(), {
        claims: { 'reg-1': { data: null, error: { message: 'claim failed' } } },
      })

      expect(result.sent).toBe(0)
      expect(result.skipped.alreadyClaimed).toBe(0)
      expect(result.errors).toEqual([expect.stringContaining('claim failed')])
      expect(mockSendCardReminderEmail).not.toHaveBeenCalled()
    })

    it('reports a claim error to Sentry so a stuck sweep is not silent', async () => {
      await sweepOne(makeRegistration(), {
        claims: { 'reg-1': { data: null, error: { message: 'claim failed' } } },
      })

      expect(mockLogError).toHaveBeenCalledWith(expect.anything(), {
        operation: 'card-reminders.claim',
        context: { registrationId: 'reg-1', eventId: 'event-1' },
      })
    })
  })

  describe('send failures', () => {
    it('records the send error and keeps the claim', async () => {
      mockSendCardReminderEmail.mockResolvedValue({ sent: false, error: 'SES down' })

      const { result, supabase } = await sweepOne(makeRegistration())

      expect(result.sent).toBe(0)
      expect(result.errors).toEqual([expect.stringContaining('SES down')])
      expect(result.errors[0]).toContain('Test Rider')
      expect(result.errors[0]).toContain('Test Brevet')
      expect(supabase.updates).toHaveLength(1)
    })

    it('records a silent non-send so a burned claim is never invisible', async () => {
      // What `sendEventFlowEmail` returns when SES isn't configured: no error,
      // but the claim is already stamped, so the reminder is gone for good.
      mockSendCardReminderEmail.mockResolvedValue({ sent: false })

      const { result, supabase } = await sweepOne(makeRegistration())

      expect(result.sent).toBe(0)
      expect(supabase.updates).toHaveLength(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Test Rider')
    })

    it('reports a burned claim to Sentry, error string or not', async () => {
      mockSendCardReminderEmail.mockResolvedValue({ sent: false })

      await sweepOne(makeRegistration())

      expect(mockLogError).toHaveBeenCalledWith(expect.anything(), {
        operation: 'card-reminders.send',
        context: { registrationId: 'reg-1', eventId: 'event-1' },
      })
    })

    it('keeps sweeping when one row throws', async () => {
      // A malformed row must not starve every rider behind it for the whole
      // 12 h window — the sweep only gets one chance per row.
      mockSendCardReminderEmail
        .mockRejectedValueOnce(new Error('template blew up'))
        .mockResolvedValueOnce({ sent: true })

      const supabase = buildSupabase({
        registrations: [
          makeRegistration({ id: 'reg-1', events: startAt(2 * HOUR) }),
          makeRegistration({ id: 'reg-2', events: startAt(3 * HOUR) }),
        ],
        controlEventIds: ['event-1'],
      })
      mockSupabaseAdmin.mockReturnValue(supabase.client)

      const result = await sendCardReminders(NOW)

      expect(result.checked).toBe(2)
      expect(result.sent).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('template blew up')
      expect(result.errors[0]).toContain('Test Rider')
      expect(result.errors[0]).toContain('Test Brevet')
    })

    it('reports a thrown row to Sentry with the registration and event', async () => {
      mockSendCardReminderEmail.mockRejectedValueOnce(new Error('template blew up'))

      await sweepOne(makeRegistration({ events: startAt(2 * HOUR) }))

      expect(mockLogError).toHaveBeenCalledWith(expect.anything(), {
        operation: 'card-reminders.row',
        context: { registrationId: 'reg-1', eventId: 'event-1' },
      })
    })
  })

  describe('start time known to the sender', () => {
    it('tells the sender the start time is known when the event has one', async () => {
      await sweepOne(makeRegistration())

      expect(mockSendCardReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ startTimeKnown: true })
      )
    })

    it('tells the sender the start time is unknown when the event has none', async () => {
      await sweepOne(makeRegistration({ events: { start_time: null } }))

      expect(mockSendCardReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ startTimeKnown: false })
      )
    })

    it('treats a midnight pre-ride start as known even when the event has no time', async () => {
      // Midnight is a legitimate pre-ride start; it must not render as "TBD".
      const midnight = new Date(NOW.getTime() + 5 * HOUR)
      const preRideDate = torontoDateString(midnight)

      const { result } = await sweepOne(
        makeRegistration({
          events: { ...startAt(9 * DAY), start_time: null },
          pre_ride_date: preRideDate,
          pre_ride_start_time: '00:00',
        })
      )

      // NOW is 19:00, so midnight tonight is 5 h out — inside the window.
      expect(result.sent).toBe(1)
      expect(mockSendCardReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ startTimeKnown: true })
      )
    })
  })

  describe('multiple candidates', () => {
    it('counts every candidate and sends only the eligible ones', async () => {
      const inWindow = makeRegistration({ id: 'reg-1', events: startAt(2 * HOUR) })
      const tooEarly = makeRegistration({ id: 'reg-2', events: startAt(3 * DAY) })
      const noControls = makeRegistration({
        id: 'reg-3',
        event_id: 'event-2',
        events: { id: 'event-2', ...startAt(4 * HOUR) },
      })

      const supabase = buildSupabase({
        registrations: [inWindow, tooEarly, noControls],
        controlEventIds: ['event-1'],
      })
      mockSupabaseAdmin.mockReturnValue(supabase.client)

      const result = await sendCardReminders(NOW)

      expect(result.checked).toBe(3)
      expect(result.sent).toBe(1)
      expect(result.skipped.notInWindow).toBe(1)
      expect(result.skipped.noControls).toBe(1)
      expect(result.errors).toEqual([])
      const controlsQuery = supabase.selects.find((s) => s.table === 'event_controls')!
      expect(controlsQuery.filters).toContainEqual(['in', 'event_id', ['event-1', 'event-2']])
    })
  })

  it('passes the rider name, email, token and event through to the sender', async () => {
    await sweepOne(makeRegistration())

    expect(mockSendCardReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        riderName: 'Test Rider',
        riderEmail: 'rider@test.com',
        managementToken: 'tok-1',
        event: expect.objectContaining({ id: 'event-1', name: 'Test Brevet' }),
      })
    )
  })
})
