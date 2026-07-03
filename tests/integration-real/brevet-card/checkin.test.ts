import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from '../registration/helpers'
import { checkInAtControl, getBrevetCardByToken } from '@/lib/actions/brevet-card'
import { resetRateLimitStores } from '@/lib/rate-limit'

const IDS = {
  rider: '00000000-1b0c-4000-a000-000000000001',
  riderCancelled: '00000000-1b0c-4000-a000-000000000002',
  activeEvent: '00000000-1b0c-4000-a000-000000000003',
  futureEvent: '00000000-1b0c-4000-a000-000000000004',
  flecheEvent: '00000000-1b0c-4000-a000-000000000005',
  controlStart: '00000000-1b0c-4000-a000-000000000006',
  controlNoCoords: '00000000-1b0c-4000-a000-000000000007',
  controlFar: '00000000-1b0c-4000-a000-000000000008',
  controlFuture: '00000000-1b0c-4000-a000-000000000009',
  controlFleche: '00000000-1b0c-4000-a000-00000000000a',
  regActive: '00000000-1b0c-4000-a000-00000000000b',
  regCancelled: '00000000-1b0c-4000-a000-00000000000c',
  regFuture: '00000000-1b0c-4000-a000-00000000000d',
  regFleche: '00000000-1b0c-4000-a000-00000000000e',
}

const RIDER_EMAIL = 'inttest-brevet-card@example.com'
const RIDER_CANCELLED_EMAIL = 'inttest-brevet-card-cancelled@example.com'

// Union Station, Toronto — the seeded location of controlStart.
const CONTROL_LAT = 43.6453
const CONTROL_LNG = -79.3806

/**
 * Toronto-local calendar date and wall time for `now + offsetMs`, so seeded
 * events are "happening now" regardless of the machine's timezone. Never
 * hardcode dates in fixtures.
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

function getAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const eventIds = [IDS.activeEvent, IDS.futureEvent, IDS.flecheEvent]
  // control_checkins and event_controls cascade from events, but delete
  // explicitly so partial seeds from interrupted runs are also removed.
  await supabase
    .from('control_checkins')
    .delete()
    .in('registration_id', [IDS.regActive, IDS.regCancelled, IDS.regFuture, IDS.regFleche])
  await supabase.from('event_controls').delete().in('event_id', eventIds)
  await supabase.from('registrations').delete().in('event_id', eventIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('riders').delete().in('id', [IDS.rider, IDS.riderCancelled])
  // Also clean by natural key: duplicate emails from interrupted runs break
  // lookups elsewhere.
  await supabase.from('riders').delete().ilike('email', RIDER_EMAIL)
  await supabase.from('riders').delete().ilike('email', RIDER_CANCELLED_EMAIL)
}

describe('digital brevet card check-in (real DB)', () => {
  const supabase = getTestSupabase()

  let activeToken: string
  let cancelledToken: string
  let futureToken: string
  let flecheToken: string

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.rider,
          slug: 'inttest-brevet-card-rider',
          first_name: 'Card',
          last_name: 'Tester',
          email: RIDER_EMAIL,
        },
        {
          id: IDS.riderCancelled,
          slug: 'inttest-brevet-card-cancelled',
          first_name: 'Cancelled',
          last_name: 'Tester',
          email: RIDER_CANCELLED_EMAIL,
        },
      ]),
      'insert riders'
    )

    // Event started one hour ago Toronto time — "happening now".
    const started = torontoNowParts(-60 * 60 * 1000)
    await checked(
      supabase.from('events').insert([
        {
          id: IDS.activeEvent,
          slug: `inttest-brevet-card-active-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Card Active',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
        {
          id: IDS.futureEvent,
          slug: `inttest-brevet-card-future-${daysFromNow(30)}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Card Future',
          event_type: 'brevet',
          distance_km: 200,
          event_date: daysFromNow(30),
          start_time: '08:00',
          status: 'scheduled',
        },
        {
          id: IDS.flecheEvent,
          slug: `inttest-brevet-card-fleche-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Card Fleche',
          event_type: 'fleche',
          distance_km: 360,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
      ]),
      'insert events'
    )

    await checked(
      supabase.from('event_controls').insert([
        {
          id: IDS.controlStart,
          event_id: IDS.activeEvent,
          position: 1,
          name: 'Start — Union Station',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlNoCoords,
          event_id: IDS.activeEvent,
          position: 2,
          name: 'Mid Control (no coords)',
          distance_km: 100,
          radius_m: 500,
        },
        {
          id: IDS.controlFar,
          event_id: IDS.activeEvent,
          position: 3,
          name: 'Finish Control',
          distance_km: 200,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlFuture,
          event_id: IDS.futureEvent,
          position: 1,
          name: 'Future Start',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlFleche,
          event_id: IDS.flecheEvent,
          position: 1,
          name: 'Fleche Start',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    await checked(
      supabase.from('registrations').insert([
        { id: IDS.regActive, event_id: IDS.activeEvent, rider_id: IDS.rider },
        {
          id: IDS.regCancelled,
          event_id: IDS.activeEvent,
          rider_id: IDS.riderCancelled,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        },
        { id: IDS.regFuture, event_id: IDS.futureEvent, rider_id: IDS.rider },
        { id: IDS.regFleche, event_id: IDS.flecheEvent, rider_id: IDS.rider },
      ]),
      'insert registrations'
    )

    // management_token is DB-generated — read the tokens back.
    const regs = await checked(
      supabase
        .from('registrations')
        .select('id, management_token')
        .in('id', [IDS.regActive, IDS.regCancelled, IDS.regFuture, IDS.regFleche]),
      'read management tokens'
    )
    const tokenById = new Map(
      (regs as { id: string; management_token: string }[]).map((r) => [r.id, r.management_token])
    )
    activeToken = tokenById.get(IDS.regActive)!
    cancelledToken = tokenById.get(IDS.regCancelled)!
    futureToken = tokenById.get(IDS.regFuture)!
    flecheToken = tokenById.get(IDS.regFleche)!
  })

  afterEach(() => {
    // The check-in rate limiter is module-level, keyed by token; leaked
    // counts would cascade across tests and reruns.
    resetRateLimitStores()
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('getBrevetCardByToken returns the event, ordered controls, and computed windows', async () => {
    const card = await getBrevetCardByToken(activeToken)
    expect(card).not.toBeNull()
    expect(card!.event.id).toBe(IDS.activeEvent)
    expect(card!.controls.map((c) => c.name)).toEqual([
      'Start — Union Station',
      'Mid Control (no coords)',
      'Finish Control',
    ])
    // Start control opens at the event start (0 km).
    expect(card!.controls[0].opensAt).toBe(card!.event.startsAt)
    expect(new Date(card!.controls[2].closesAt).getTime()).toBeGreaterThan(
      new Date(card!.controls[2].opensAt).getTime()
    )
  })

  it('returns null for an unknown token', async () => {
    expect(await getBrevetCardByToken('00000000-dead-4000-a000-000000000000')).toBeNull()
  })

  it('records a GPS check-in within the radius with no flags', async () => {
    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracyM: 12,
    })
    expect(result.success).toBe(true)
    expect(result.data!.alreadyExisted).toBe(false)
    expect(result.data!.checkin.method).toBe('gps')
    expect(result.data!.checkin.distanceToControlM).toBeLessThan(5)
    expect(result.data!.checkin.flags.outOfRadius).toBe(false)
    expect(result.data!.checkin.flags.noGps).toBe(false)
    expect(result.data!.checkin.flags.lateSync).toBe(false)
  })

  it('is idempotent: retrying the same control returns the existing check-in', async () => {
    const first = await checked(
      supabase
        .from('control_checkins')
        .select('checked_in_at')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlStart)
        .single(),
      'read first checkin'
    )

    const retry = await checkInAtControl(activeToken, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
    })
    expect(retry.success).toBe(true)
    expect(retry.data!.alreadyExisted).toBe(true)
    // The original tap time survives the retry.
    expect(retry.data!.checkin.checkedInAt).toBe((first as { checked_in_at: string }).checked_in_at)
  })

  it('records a manual check-in (no coordinates) flagged as noGps', async () => {
    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
    expect(result.data!.checkin.method).toBe('manual')
    expect(result.data!.checkin.flags.noGps).toBe(true)
    expect(result.data!.checkin.distanceToControlM).toBeNull()
  })

  it('accepts but flags a GPS check-in outside the control radius', async () => {
    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlFar,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT + 0.05, // ~5.5 km north
      lng: CONTROL_LNG,
      accuracyM: 10,
    })
    expect(result.success).toBe(true)
    expect(result.data!.checkin.distanceToControlM).toBeGreaterThan(500)
    expect(result.data!.checkin.flags.outOfRadius).toBe(true)
  })

  it('rejects an unknown token', async () => {
    const result = await checkInAtControl('00000000-dead-4000-a000-000000000000', {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it("rejects a control belonging to a different event than the token's", async () => {
    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlFuture,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/control not found/i)
  })

  it('rejects check-ins far outside the event window', async () => {
    const result = await checkInAtControl(futureToken, {
      controlId: IDS.controlFuture,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/only accepted/i)
  })

  it('rejects cancelled registrations', async () => {
    const result = await checkInAtControl(cancelledToken, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/active registrations/i)
  })

  it('rejects fleche events (no digital card)', async () => {
    const result = await checkInAtControl(flecheToken, {
      controlId: IDS.controlFleche,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/does not use a digital brevet card/i)
  })

  it('rejects check-in timestamps from the future', async () => {
    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlFar,
      checkedInAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/future/i)
  })

  it('enforces the per-token rate limit', async () => {
    let limited = false
    for (let i = 0; i < 35; i++) {
      const result = await checkInAtControl(activeToken, {
        controlId: IDS.controlStart,
        checkedInAt: new Date().toISOString(),
      })
      if (!result.success && /too many/i.test(result.error || '')) {
        limited = true
        break
      }
    }
    expect(limited).toBe(true)
  })

  it('hides event_controls and control_checkins from the anon role', async () => {
    const anon = getAnonSupabase()

    const controls = await anon.from('event_controls').select('id').limit(1)
    expect(controls.error !== null || (controls.data || []).length === 0).toBe(true)

    const checkins = await anon.from('control_checkins').select('id').limit(1)
    expect(checkins.error !== null || (checkins.data || []).length === 0).toBe(true)

    // Sanity: the service role does see the seeded rows the anon client
    // couldn't, so the assertions above prove denial rather than emptiness.
    const adminControls = await checked(
      supabase.from('event_controls').select('id').eq('event_id', IDS.activeEvent),
      'admin reads controls'
    )
    expect((adminControls as unknown[]).length).toBeGreaterThan(0)
  })

  it('deleting a control cascades to its check-ins', async () => {
    const before = await checked(
      supabase.from('control_checkins').select('id').eq('control_id', IDS.controlFar),
      'checkins before delete'
    )
    expect((before as unknown[]).length).toBe(1)

    await checked(
      supabase.from('event_controls').delete().eq('id', IDS.controlFar),
      'delete control'
    )

    const after = await checked(
      supabase.from('control_checkins').select('id').eq('control_id', IDS.controlFar),
      'checkins after delete'
    )
    expect((after as unknown[]).length).toBe(0)
  })
})
