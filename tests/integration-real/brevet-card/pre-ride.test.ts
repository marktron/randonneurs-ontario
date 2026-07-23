import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from '../registration/helpers'
import { resetRateLimitStores } from '@/lib/rate-limit'
import { checkInAtControl, getBrevetCardByToken } from '@/lib/actions/brevet-card'
import { getEventCheckinsForAdmin } from '@/lib/actions/control-checkins'
import { setPreRideStart } from '@/lib/actions/pre-ride'

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
  eventFleche: '00000000-921d-4000-a000-00000000000c',
  eventCompleted: '00000000-921d-4000-a000-00000000000d',
  regFleche: '00000000-921d-4000-a000-00000000000e',
  regCompleted: '00000000-921d-4000-a000-00000000000f',
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
  const regIds = [
    IDS.regPre,
    IDS.regRegular,
    IDS.regTarget,
    IDS.regCancelled,
    IDS.regFleche,
    IDS.regCompleted,
  ]
  const riderIds = [IDS.riderPre, IDS.riderRegular, IDS.riderTarget, IDS.riderCancelled]
  const eventIds = [IDS.event, IDS.eventFleche, IDS.eventCompleted]
  await supabase.from('control_checkins').delete().in('registration_id', regIds)
  await supabase.from('results').delete().in('event_id', eventIds)
  await supabase.from('event_controls').delete().in('event_id', eventIds)
  await supabase.from('registrations').delete().in('event_id', eventIds)
  await supabase.from('events').delete().in('id', eventIds)
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

  let preToken: string
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
        {
          id: IDS.eventFleche,
          slug: `${EVENT_SLUG_PREFIX}fleche-${daysFromNow(3)}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Pre-Ride Fleche',
          event_type: 'fleche',
          distance_km: 360,
          event_date: daysFromNow(3),
          start_time: '08:00',
          status: 'scheduled',
        },
        {
          id: IDS.eventCompleted,
          slug: `${EVENT_SLUG_PREFIX}completed-${daysFromNow(-3)}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Pre-Ride Completed Brevet',
          event_type: 'brevet',
          distance_km: 200,
          event_date: daysFromNow(-3),
          start_time: '08:00',
          status: 'completed',
        },
      ]),
      'insert events'
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
        {
          id: IDS.regFleche,
          event_id: IDS.eventFleche,
          rider_id: IDS.riderTarget,
          status: 'registered',
          pre_ride_date: null,
          pre_ride_start_time: null,
        },
        {
          id: IDS.regCompleted,
          event_id: IDS.eventCompleted,
          rider_id: IDS.riderTarget,
          status: 'registered',
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

  describe('rider card with a pre-ride start', () => {
    it('computes startsAt and control windows from the pre-ride start', async () => {
      const card = await getBrevetCardByToken(preToken)
      expect(card).not.toBeNull()
      expect(card!.registration.isPreRide).toBe(true)
      // startsAt ≈ two hours ago (minute precision from the seed).
      const startsAtMs = new Date(card!.event.startsAt).getTime()
      expect(Math.abs(startsAtMs - (Date.now() - TWO_HOURS_MS))).toBeLessThan(5 * 60 * 1000)
      // The 0 km control opened at the pre-ride start — in the past, not in
      // 3 days. (Single-route control: opensAt is always non-null.)
      const control1 = card!.controls.find((c) => c.id === IDS.control1)!
      expect(control1.opensAt).not.toBeNull()
      expect(new Date(control1.opensAt!).getTime()).toBeLessThan(Date.now())
    })

    it('leaves regular riders on the event schedule', async () => {
      const card = await getBrevetCardByToken(regularToken)
      expect(card).not.toBeNull()
      expect(card!.registration.isPreRide).toBe(false)
      // Their 0 km control opens at the scheduled start, ~3 days from now.
      const control1 = card!.controls.find((c) => c.id === IDS.control1)!
      expect(control1.opensAt).not.toBeNull()
      expect(new Date(control1.opensAt!).getTime()).toBeGreaterThan(Date.now())
    })

    it('accepts a pre-rider check-in days before the scheduled start', async () => {
      const result = await checkInAtControl(preToken, {
        controlId: IDS.control1,
        // Tapped right at the pre-ride start (backdated two hours, allowed:
        // the acceptance window opens 2 h before the rider's start).
        checkedInAt: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
        accuracyM: 10,
      })
      expect(result.success).toBe(true)
      expect(result.data?.checkin.flags.early).toBe(false)
      expect(result.data?.checkin.flags.late).toBe(false)
    })

    it('still rejects a regular rider before the event window opens', async () => {
      const result = await checkInAtControl(regularToken, {
        controlId: IDS.control1,
        checkedInAt: new Date().toISOString(),
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
        accuracyM: 10,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('only accepted around the event')
    })

    it('computes the finish time from the pre-ride start', async () => {
      const result = await checkInAtControl(preToken, {
        controlId: IDS.control2,
        checkedInAt: new Date().toISOString(),
      })
      expect(result.success).toBe(true)

      const { data: resultRows } = await supabase
        .from('results')
        .select('status, finish_time')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderPre)
      expect(resultRows).toHaveLength(1)
      expect(resultRows![0].status).toBe('finished')
      // ~2 h elapsed since the pre-ride start. Had the code used the event
      // start (3 days in the future) this would clamp to 00:00:00.
      expect(String(resultRows![0].finish_time)).toMatch(/^02:0[0-2]/)
    })
  })

  describe('admin check-in grid with a pre-ride start', () => {
    it('flags identical check-in times per rider start', async () => {
      const twoHoursAgo = new Date(Date.now() - TWO_HOURS_MS).toISOString()
      // Insert directly: the same wall-clock tap for both riders.
      await checked(
        supabase.from('control_checkins').insert([
          {
            control_id: IDS.control1,
            registration_id: IDS.regPre,
            checked_in_at: twoHoursAgo,
            method: 'manual',
          },
          {
            control_id: IDS.control1,
            registration_id: IDS.regRegular,
            checked_in_at: twoHoursAgo,
            method: 'manual',
          },
        ]),
        'insert grid checkins'
      )

      const result = await getEventCheckinsForAdmin(IDS.event)
      expect(result.success).toBe(true)
      const byReg = new Map(result.data!.map((r) => [r.registrationId, r]))

      const preRider = byReg.get(IDS.regPre)!
      expect(preRider.preRideDate).not.toBeNull()
      expect(preRider.checkins[0].flags.early).toBe(false)

      const regular = byReg.get(IDS.regRegular)!
      expect(regular.preRideDate).toBeNull()
      // Same timestamp, but their window opens with the event in 3 days.
      expect(regular.checkins[0].flags.early).toBe(true)
    })
  })

  describe('setPreRideStart', () => {
    it('sets and clears a pre-ride start', async () => {
      const set = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: daysFromNow(1),
        preRideStartTime: '07:00',
      })
      expect(set.success).toBe(true)

      const { data: afterSet } = await supabase
        .from('registrations')
        .select('pre_ride_date, pre_ride_start_time')
        .eq('id', IDS.regTarget)
        .single()
      expect(afterSet!.pre_ride_date).toBe(daysFromNow(1))
      expect(String(afterSet!.pre_ride_start_time)).toMatch(/^07:00/)

      const clear = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: null,
        preRideStartTime: null,
      })
      expect(clear.success).toBe(true)

      const { data: afterClear } = await supabase
        .from('registrations')
        .select('pre_ride_date, pre_ride_start_time')
        .eq('id', IDS.regTarget)
        .single()
      expect(afterClear!.pre_ride_date).toBeNull()
      expect(afterClear!.pre_ride_start_time).toBeNull()
    })

    it('rejects malformed dates and times', async () => {
      const badDate = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: 'next tuesday',
        preRideStartTime: '07:00',
      })
      expect(badDate.success).toBe(false)
      expect(badDate.error).toContain('YYYY-MM-DD')

      const badTime = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: daysFromNow(1),
        preRideStartTime: '7am',
      })
      expect(badTime.success).toBe(false)
      expect(badTime.error).toContain('HH:MM')

      const halfSet = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: daysFromNow(1),
        preRideStartTime: null,
      })
      expect(halfSet.success).toBe(false)
      expect(halfSet.error).toContain('HH:MM')

      const { data: afterRejections } = await supabase
        .from('registrations')
        .select('pre_ride_date, pre_ride_start_time')
        .eq('id', IDS.regTarget)
        .single()
      expect(afterRejections!.pre_ride_date).toBeNull()
      expect(afterRejections!.pre_ride_start_time).toBeNull()
    })

    it('rejects out-of-range calendar dates and times', async () => {
      const badMonth = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: '2026-13-01',
        preRideStartTime: '07:00',
      })
      expect(badMonth.success).toBe(false)
      expect(badMonth.error).toContain('YYYY-MM-DD')

      const badDay = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: '2026-02-31',
        preRideStartTime: '07:00',
      })
      expect(badDay.success).toBe(false)
      expect(badDay.error).toContain('YYYY-MM-DD')

      const badHour = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: daysFromNow(1),
        preRideStartTime: '25:00',
      })
      expect(badHour.success).toBe(false)
      expect(badHour.error).toContain('HH:MM')

      const badMinute = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: daysFromNow(1),
        preRideStartTime: '08:61',
      })
      expect(badMinute.success).toBe(false)
      expect(badMinute.error).toContain('HH:MM')

      // A valid leap day proves the calendar check isn't overzealous.
      const leapDay = await setPreRideStart({
        registrationId: IDS.regTarget,
        preRideDate: '2028-02-29',
        preRideStartTime: '07:00',
      })
      expect(leapDay.success).toBe(true)

      const { data: afterLeapDay } = await supabase
        .from('registrations')
        .select('pre_ride_date, pre_ride_start_time')
        .eq('id', IDS.regTarget)
        .single()
      expect(afterLeapDay!.pre_ride_date).toBe('2028-02-29')
      expect(String(afterLeapDay!.pre_ride_start_time)).toMatch(/^07:00/)
    })

    it('rejects cancelled registrations', async () => {
      const result = await setPreRideStart({
        registrationId: IDS.regCancelled,
        preRideDate: daysFromNow(1),
        preRideStartTime: '07:00',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('active registrations')
    })

    it('rejects registrations for event types without a digital brevet card', async () => {
      const result = await setPreRideStart({
        registrationId: IDS.regFleche,
        preRideDate: daysFromNow(1),
        preRideStartTime: '07:00',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('digital brevet card')
    })

    it('rejects registrations on a non-scheduled event', async () => {
      const result = await setPreRideStart({
        registrationId: IDS.regCompleted,
        preRideDate: daysFromNow(1),
        preRideStartTime: '07:00',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('scheduled')
    })
  })
})
