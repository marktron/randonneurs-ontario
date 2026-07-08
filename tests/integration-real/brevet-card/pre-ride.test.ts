import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from '../registration/helpers'
import { resetRateLimitStores } from '@/lib/rate-limit'

// Admin actions (Tasks 4–5) run with no auth session, and audit_logs.admin_id
// has a NOT NULL FK to admins(id) — mock both so the actions run against the
// real DB (same pattern as save-controls.test.ts).
vi.mock('@/lib/auth/get-admin', () => ({
  getAdmin: vi.fn(async () => ({ id: '00000000-921d-4000-a000-0000000000ad' })),
  requireAdmin: vi.fn(async () => ({ id: '00000000-921d-4000-a000-0000000000ad' })),
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => {}),
}))
// The final-control check-in (Task 3) triggers the ride-complete email.
vi.mock('@/lib/email/send-ride-complete-email', () => ({
  sendRideCompleteEmail: vi.fn(async () => ({ success: true })),
}))

const IDS = {
  riderPre: '00000000-921d-4000-a000-000000000001',
  riderRegular: '00000000-921d-4000-a000-000000000002',
  riderTarget: '00000000-921d-4000-a000-000000000003',
  riderCancelled: '00000000-921d-4000-a000-000000000004',
  event: '00000000-921d-4000-a000-000000000005',
  control1: '00000000-921d-4000-a000-000000000006',
  control2: '00000000-921d-4000-a000-000000000007',
  regPre: '00000000-921d-4000-a000-000000000008',
  regRegular: '00000000-921d-4000-a000-000000000009',
  regTarget: '00000000-921d-4000-a000-00000000000a',
  regCancelled: '00000000-921d-4000-a000-00000000000b',
}

const EMAILS = {
  pre: 'inttest-pre-ride-pre@example.com',
  regular: 'inttest-pre-ride-regular@example.com',
  target: 'inttest-pre-ride-target@example.com',
  cancelled: 'inttest-pre-ride-cancelled@example.com',
}

const EVENT_SLUG_PREFIX = 'inttest-pre-ride-'
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

// Union Station, Toronto — location of control1.
const CONTROL_LAT = 43.6453
const CONTROL_LNG = -79.3806

/**
 * Toronto-local calendar date and wall time for `now + offsetMs`, so the
 * seeded pre-ride is "happening now" regardless of machine timezone.
 */
function torontoNowParts(offsetMs: number): { date: string; time: string } {
  const d = new Date(Date.now() + offsetMs)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const regIds = [IDS.regPre, IDS.regRegular, IDS.regTarget, IDS.regCancelled]
  const riderIds = [IDS.riderPre, IDS.riderRegular, IDS.riderTarget, IDS.riderCancelled]
  await supabase.from('control_checkins').delete().in('registration_id', regIds)
  await supabase.from('results').delete().eq('event_id', IDS.event)
  await supabase.from('event_controls').delete().eq('event_id', IDS.event)
  await supabase.from('registrations').delete().eq('event_id', IDS.event)
  await supabase.from('events').delete().eq('id', IDS.event)
  // Also by natural key: the slug embeds a relative date, so leftovers from
  // an interrupted run on another day have our id but a different slug.
  await supabase.from('events').delete().ilike('slug', `${EVENT_SLUG_PREFIX}%`)
  await supabase.from('riders').delete().in('id', riderIds)
  for (const email of Object.values(EMAILS)) {
    await supabase.from('riders').delete().ilike('email', email)
  }
}

describe('digital brevet card pre-rides (real DB)', () => {
  const supabase = getTestSupabase()

  // Pre-ride started two hours ago Toronto time — "happening now", while the
  // event itself is three days out. Chosen so a finish check-in "now" yields
  // a ~2:00 elapsed time, which the event-start fallback could not produce
  // (a future start clamps elapsed to 0:00).
  const preRideStart = torontoNowParts(-TWO_HOURS_MS)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed by Task 3's tests
  let preToken: string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed by Task 3's tests
  let regularToken: string

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderPre,
          slug: 'inttest-pre-ride-pre',
          first_name: 'Pre',
          last_name: 'Rider',
          email: EMAILS.pre,
        },
        {
          id: IDS.riderRegular,
          slug: 'inttest-pre-ride-regular',
          first_name: 'Regular',
          last_name: 'Rider',
          email: EMAILS.regular,
        },
        {
          id: IDS.riderTarget,
          slug: 'inttest-pre-ride-target',
          first_name: 'Target',
          last_name: 'Rider',
          email: EMAILS.target,
        },
        {
          id: IDS.riderCancelled,
          slug: 'inttest-pre-ride-cancelled',
          first_name: 'Cancelled',
          last_name: 'Rider',
          email: EMAILS.cancelled,
        },
      ]),
      'insert riders'
    )

    await checked(
      supabase.from('events').insert([
        {
          id: IDS.event,
          slug: `${EVENT_SLUG_PREFIX}${daysFromNow(3)}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Pre-Ride Brevet',
          event_type: 'brevet',
          distance_km: 200,
          event_date: daysFromNow(3),
          start_time: '08:00',
          status: 'scheduled',
        },
      ]),
      'insert event'
    )

    await checked(
      supabase.from('event_controls').insert([
        {
          id: IDS.control1,
          event_id: IDS.event,
          position: 1,
          name: 'Start — Union Station',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.control2,
          event_id: IDS.event,
          position: 2,
          name: 'Finish (no coords)',
          distance_km: 200,
          lat: null,
          lng: null,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    // Every row lists the same keys explicitly — supabase-js sends missing
    // keys in a mixed-key bulk insert as NULL, bypassing column defaults.
    await checked(
      supabase.from('registrations').insert([
        {
          id: IDS.regPre,
          event_id: IDS.event,
          rider_id: IDS.riderPre,
          status: 'registered',
          pre_ride_date: preRideStart.date,
          pre_ride_start_time: preRideStart.time,
        },
        {
          id: IDS.regRegular,
          event_id: IDS.event,
          rider_id: IDS.riderRegular,
          status: 'registered',
          pre_ride_date: null,
          pre_ride_start_time: null,
        },
        {
          id: IDS.regTarget,
          event_id: IDS.event,
          rider_id: IDS.riderTarget,
          status: 'registered',
          pre_ride_date: null,
          pre_ride_start_time: null,
        },
        {
          id: IDS.regCancelled,
          event_id: IDS.event,
          rider_id: IDS.riderCancelled,
          status: 'cancelled',
          pre_ride_date: null,
          pre_ride_start_time: null,
        },
      ]),
      'insert registrations'
    )

    // management_token is DB-generated — read the tokens back.
    const tokenRows = await checked(
      supabase
        .from('registrations')
        .select('id, management_token')
        .in('id', [IDS.regPre, IDS.regRegular]),
      'select tokens'
    )
    const tokens = new Map(
      (tokenRows as { id: string; management_token: string }[]).map((r) => [
        r.id,
        r.management_token,
      ])
    )
    preToken = tokens.get(IDS.regPre)!
    regularToken = tokens.get(IDS.regRegular)!
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  afterEach(async () => {
    resetRateLimitStores()
    // Keep tests order-independent: drop check-ins/results made by a test and
    // restore regTarget (mutated by the setPreRideStart tests).
    await supabase
      .from('control_checkins')
      .delete()
      .in('registration_id', [IDS.regPre, IDS.regRegular, IDS.regTarget])
    await supabase.from('results').delete().eq('event_id', IDS.event)
    await supabase
      .from('registrations')
      .update({ pre_ride_date: null, pre_ride_start_time: null })
      .eq('id', IDS.regTarget)
  })

  describe('pre-ride columns', () => {
    it('rejects a pre-ride date without a start time (CHECK constraint)', async () => {
      const { error } = await supabase
        .from('registrations')
        .update({ pre_ride_date: daysFromNow(1) })
        .eq('id', IDS.regRegular)
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23514')
    })

    it('accepts setting and clearing both columns together', async () => {
      const { error: setError } = await supabase
        .from('registrations')
        .update({ pre_ride_date: daysFromNow(1), pre_ride_start_time: '07:00' })
        .eq('id', IDS.regTarget)
      expect(setError).toBeNull()

      const { error: clearError } = await supabase
        .from('registrations')
        .update({ pre_ride_date: null, pre_ride_start_time: null })
        .eq('id', IDS.regTarget)
      expect(clearError).toBeNull()
    })
  })
})
