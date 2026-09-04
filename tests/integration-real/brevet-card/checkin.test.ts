import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from '../registration/helpers'
import { checkInAtControl, getBrevetCardByToken } from '@/lib/actions/brevet-card'
import { computeEventStart, RIDER_UNDO_WINDOW_MS } from '@/lib/brevet-card'
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
  soonEvent: '00000000-1b0c-4000-a000-00000000000f',
  controlSoonStart: '00000000-1b0c-4000-a000-000000000010',
  regSoon: '00000000-1b0c-4000-a000-000000000011',
}

/**
 * Offset for the "starts soon" event: 30 minutes from now, inside the
 * check-in acceptance window (start − 2h) but outside any control's ACP
 * open window, so a pre-start tap at the first control exercises the clamp.
 * The existing `futureEvent` (30 days out) is outside the acceptance window
 * entirely and can't be reused for this.
 */
const SOON_EVENT_OFFSET_MS = 30 * 60 * 1000

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
  const eventIds = [IDS.activeEvent, IDS.futureEvent, IDS.flecheEvent, IDS.soonEvent]
  // control_checkins and event_controls cascade from events, but delete
  // explicitly so partial seeds from interrupted runs are also removed.
  await supabase
    .from('control_checkins')
    .delete()
    .in('registration_id', [
      IDS.regActive,
      IDS.regCancelled,
      IDS.regFuture,
      IDS.regFleche,
      IDS.regSoon,
    ])
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
  let soonToken: string
  let soonEventStart: Date

  async function clearActiveCheckin(controlId = IDS.controlNoCoords) {
    await checked(
      supabase
        .from('control_checkins')
        .delete()
        .eq('registration_id', IDS.regActive)
        .eq('control_id', controlId),
      'clear active check-in'
    )
  }

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
    // Event starts 30 minutes from now — inside the check-in acceptance
    // window but not yet open, so a tap now exercises the first-control
    // start-time clamp.
    const soon = torontoNowParts(SOON_EVENT_OFFSET_MS)
    soonEventStart = computeEventStart(soon.date, soon.time)
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
        {
          id: IDS.soonEvent,
          slug: `inttest-brevet-card-soon-${soon.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Card Soon',
          event_type: 'brevet',
          distance_km: 200,
          event_date: soon.date,
          start_time: soon.time,
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
        {
          id: IDS.controlSoonStart,
          event_id: IDS.soonEvent,
          position: 1,
          name: 'Start — Union Station',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    // Every row needs an explicit status: supabase-js normalizes bulk
    // inserts to the union of keys and sends missing ones as NULL, which
    // BYPASSES the column default — a bare row next to the cancelled one
    // lands with status NULL, not 'registered'.
    await checked(
      supabase.from('registrations').insert([
        { id: IDS.regActive, event_id: IDS.activeEvent, rider_id: IDS.rider, status: 'registered' },
        {
          id: IDS.regCancelled,
          event_id: IDS.activeEvent,
          rider_id: IDS.riderCancelled,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        },
        {
          id: IDS.regFuture,
          event_id: IDS.futureEvent,
          rider_id: IDS.rider,
          status: 'registered',
        },
        {
          id: IDS.regFleche,
          event_id: IDS.flecheEvent,
          rider_id: IDS.rider,
          status: 'registered',
        },
        {
          id: IDS.regSoon,
          event_id: IDS.soonEvent,
          rider_id: IDS.rider,
          status: 'registered',
        },
      ]),
      'insert registrations'
    )

    // management_token is DB-generated — read the tokens back.
    const regs = await checked(
      supabase
        .from('registrations')
        .select('id, management_token')
        .in('id', [IDS.regActive, IDS.regCancelled, IDS.regFuture, IDS.regFleche, IDS.regSoon]),
      'read management tokens'
    )
    const tokenById = new Map(
      (regs as { id: string; management_token: string }[]).map((r) => [r.id, r.management_token])
    )
    activeToken = tokenById.get(IDS.regActive)!
    cancelledToken = tokenById.get(IDS.regCancelled)!
    futureToken = tokenById.get(IDS.regFuture)!
    flecheToken = tokenById.get(IDS.regFleche)!
    soonToken = tokenById.get(IDS.regSoon)!
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
    // Start control opens at the event start (0 km). Every control carries a
    // window; collection controls compute theirs from the cumulative event
    // distance.
    expect(card!.controls[0].opensAt).toBe(card!.event.startsAt)
    expect(card!.controls[2].opensAt).not.toBeNull()
    expect(card!.controls[2].closesAt).not.toBeNull()
    expect(new Date(card!.controls[2].closesAt!).getTime()).toBeGreaterThan(
      new Date(card!.controls[2].opensAt!).getTime()
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

  it('rejects partial coordinates and accuracy without coordinates at the action boundary', async () => {
    const partial = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
    } as never)
    expect(partial.success).toBe(false)
    expect(partial.error).toMatch(/provided together/i)

    const accuracyOnly = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      accuracyM: 10,
    } as never)
    expect(accuracyOnly.success).toBe(false)
    expect(accuracyOnly.error).toMatch(/accuracy requires/i)
  })

  it('persists bounded diagnostics for a manual check-in', async () => {
    await clearActiveCheckin()

    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 55_000,
        context: 'embedded',
      },
    })
    expect(result.success).toBe(true)
    expect(result.data!.upgradedFromManual).toBe(false)

    const row = await checked(
      supabase
        .from('control_checkins')
        .select(
          'method, lat, lng, accuracy_m, location_failure_reason, location_failure_stage, location_failure_elapsed_ms, location_failure_context'
        )
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read manual diagnostic'
    )
    expect(row).toMatchObject({
      method: 'manual',
      lat: null,
      lng: null,
      accuracy_m: null,
      location_failure_reason: 'timeout',
      location_failure_stage: 'high_accuracy',
      location_failure_elapsed_ms: 55_000,
      location_failure_context: 'embedded',
    })
  })

  it('upgrades a recent manual row to GPS in place and clears failure diagnostics', async () => {
    await clearActiveCheckin()
    const manual = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'position_unavailable',
        stage: 'high_accuracy',
        elapsedMs: 40_000,
        context: 'browser',
      },
    })
    expect(manual.success).toBe(true)

    const before = await checked(
      supabase
        .from('control_checkins')
        .select('id, checked_in_at, received_at')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read manual before GPS upgrade'
    )

    const upgraded = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracyM: 9,
      expectedManualReceivedAt: (before as { received_at: string }).received_at,
    })
    expect(upgraded.success).toBe(true)
    expect(upgraded.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: true,
      checkin: {
        checkedInAt: (before as { checked_in_at: string }).checked_in_at,
        receivedAt: (before as { received_at: string }).received_at,
        method: 'gps',
      },
    })

    const after = await checked(
      supabase
        .from('control_checkins')
        .select(
          'id, checked_in_at, received_at, method, lat, lng, accuracy_m, location_failure_reason, location_failure_stage, location_failure_elapsed_ms, location_failure_context'
        )
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read GPS upgrade'
    )
    expect(after).toMatchObject({
      id: (before as { id: string }).id,
      checked_in_at: (before as { checked_in_at: string }).checked_in_at,
      received_at: (before as { received_at: string }).received_at,
      method: 'gps',
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracy_m: 9,
      location_failure_reason: null,
      location_failure_stage: null,
      location_failure_elapsed_ms: null,
      location_failure_context: null,
    })
  })

  it('refuses a GPS upgrade whose fix is outside the control radius', async () => {
    await clearActiveCheckin(IDS.controlStart)
    const manual = await checkInAtControl(activeToken, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'permission_denied',
        stage: 'preflight',
        elapsedMs: 0,
        context: 'browser',
      },
    })
    expect(manual.success).toBe(true)

    const before = await checked(
      supabase
        .from('control_checkins')
        .select('received_at')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlStart)
        .single(),
      'read manual before far upgrade'
    )

    // ~5.5 km north of controlStart, well outside its 500 m radius.
    const rejected = await checkInAtControl(activeToken, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT + 0.05,
      lng: CONTROL_LNG,
      accuracyM: 9,
      expectedManualReceivedAt: (before as { received_at: string }).received_at,
    })
    expect(rejected.success).toBe(false)
    expect(rejected.retryable).not.toBe(true)

    const after = await checked(
      supabase
        .from('control_checkins')
        .select('method, lat, lng, location_failure_reason, location_failure_stage')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlStart)
        .single(),
      'read row after refused upgrade'
    )
    expect(after).toMatchObject({
      method: 'manual',
      lat: null,
      lng: null,
      location_failure_reason: 'permission_denied',
      location_failure_stage: 'preflight',
    })
    await clearActiveCheckin(IDS.controlStart)
  })

  it('does not let a stale GPS retry upgrade a manual row created after Undo', async () => {
    await clearActiveCheckin()
    const staleReceivedAt = new Date(Date.now() - 60_000).toISOString()
    const replacementReceivedAt = new Date(Date.now() - 10_000).toISOString()
    await checked(
      supabase.from('control_checkins').insert({
        registration_id: IDS.regActive,
        control_id: IDS.controlNoCoords,
        checked_in_at: replacementReceivedAt,
        received_at: replacementReceivedAt,
        method: 'manual',
      }),
      'insert replacement manual check-in'
    )

    const staleRetry = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      expectedManualReceivedAt: staleReceivedAt,
    })

    expect(staleRetry.success).toBe(true)
    expect(staleRetry.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'manual' },
    })
    expect(new Date(staleRetry.data!.checkin.receivedAt).getTime()).toBe(
      new Date(replacementReceivedAt).getTime()
    )

    const row = await checked(
      supabase
        .from('control_checkins')
        .select('method, lat, lng')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read replacement manual check-in'
    )
    expect(row).toMatchObject({ method: 'manual', lat: null, lng: null })
  })

  it('does not recreate a manual row removed before a delayed GPS retry arrives', async () => {
    await clearActiveCheckin()
    const removedReceivedAt = new Date(Date.now() - 10_000).toISOString()

    const staleRetry = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      expectedManualReceivedAt: removedReceivedAt,
    })

    expect(staleRetry.success).toBe(false)
    expect(staleRetry.retryable).toBeUndefined()
    expect(staleRetry.error).toMatch(/removed before gps could be added/i)

    const rows = await checked(
      supabase
        .from('control_checkins')
        .select('id')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords),
      'verify stale GPS retry did not recreate check-in'
    )
    expect(rows).toEqual([])
  })

  it('does not upgrade a manual row after the rider window', async () => {
    await clearActiveCheckin()
    const oldReceivedAt = new Date(Date.now() - RIDER_UNDO_WINDOW_MS - 60_000).toISOString()
    await checked(
      supabase.from('control_checkins').insert({
        registration_id: IDS.regActive,
        control_id: IDS.controlNoCoords,
        checked_in_at: oldReceivedAt,
        received_at: oldReceivedAt,
        method: 'manual',
      }),
      'insert expired manual check-in'
    )

    const result = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      expectedManualReceivedAt: oldReceivedAt,
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'manual' },
    })
    expect(new Date(result.data!.checkin.receivedAt).getTime()).toBe(
      new Date(oldReceivedAt).getTime()
    )

    const row = await checked(
      supabase
        .from('control_checkins')
        .select('method, lat, lng')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read expired manual check-in'
    )
    expect(row).toMatchObject({ method: 'manual', lat: null, lng: null })
  })

  it('never downgrades GPS or replaces an organizer check-in', async () => {
    await clearActiveCheckin()
    await checked(
      supabase.from('control_checkins').insert({
        registration_id: IDS.regActive,
        control_id: IDS.controlNoCoords,
        checked_in_at: new Date().toISOString(),
        method: 'gps',
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
      }),
      'insert GPS check-in'
    )

    const manualRetry = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 60_000,
        context: 'browser',
      },
    })
    expect(manualRetry.success).toBe(true)
    expect(manualRetry.data).toMatchObject({
      upgradedFromManual: false,
      checkin: { method: 'gps' },
    })

    await clearActiveCheckin()
    await checked(
      supabase.from('control_checkins').insert({
        registration_id: IDS.regActive,
        control_id: IDS.controlNoCoords,
        checked_in_at: new Date().toISOString(),
        method: 'admin',
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
        note: 'Organizer-confirmed GPS fix',
      }),
      'insert organizer check-in with paired GPS fix'
    )

    const gpsRetry = await checkInAtControl(activeToken, {
      controlId: IDS.controlNoCoords,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT + 0.01,
      lng: CONTROL_LNG + 0.01,
    })
    expect(gpsRetry.success).toBe(true)
    expect(gpsRetry.data).toMatchObject({
      upgradedFromManual: false,
      checkin: { method: 'admin' },
    })

    const admin = await checked(
      supabase
        .from('control_checkins')
        .select('method, lat, lng, note')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlNoCoords)
        .single(),
      'read organizer check-in'
    )
    expect(admin).toMatchObject({
      method: 'admin',
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      note: 'Organizer-confirmed GPS fix',
    })
  })

  it('enforces coordinate, method, measurement, and diagnostic constraints in the database', async () => {
    await clearActiveCheckin()
    const base = {
      registration_id: IDS.regActive,
      control_id: IDS.controlNoCoords,
      checked_in_at: new Date().toISOString(),
    }

    const partialCoordinates = await supabase
      .from('control_checkins')
      .insert({ ...base, method: 'gps', lat: CONTROL_LAT })
    expect(partialCoordinates.error?.code).toBe('23514')

    const accuracyWithoutCoordinates = await supabase
      .from('control_checkins')
      .insert({ ...base, method: 'manual', accuracy_m: 10 })
    expect(accuracyWithoutCoordinates.error?.code).toBe('23514')

    const gpsWithoutCoordinates = await supabase
      .from('control_checkins')
      .insert({ ...base, method: 'gps' })
    expect(gpsWithoutCoordinates.error?.code).toBe('23514')

    const manualWithCoordinates = await supabase.from('control_checkins').insert({
      ...base,
      method: 'manual',
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
    })
    // Preserve complete coordinate evidence written by legacy clients. The
    // current action no longer creates this shape, but the migration must not
    // erase or reject it merely because its provenance label is `manual`.
    expect(manualWithCoordinates.error).toBeNull()
    await clearActiveCheckin()

    // SQL CHECK treats UNKNOWN as passing, so this specifically guards the
    // explicit all-four-IS-NOT-NULL predicates in the migration.
    const partialDiagnostic = await supabase.from('control_checkins').insert({
      ...base,
      method: 'manual',
      location_failure_reason: 'timeout',
    })
    expect(partialDiagnostic.error?.code).toBe('23514')

    const gpsAndFailureDiagnostic = await supabase.from('control_checkins').insert({
      ...base,
      method: 'admin',
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      location_failure_reason: 'timeout',
      location_failure_stage: 'high_accuracy',
      location_failure_elapsed_ms: 45_000,
      location_failure_context: 'browser',
    })
    expect(gpsAndFailureDiagnostic.error?.code).toBe('23514')

    const partialControlCoordinates = await supabase
      .from('event_controls')
      .update({ lat: null, lng: CONTROL_LNG })
      .eq('id', IDS.controlStart)
    expect(partialControlCoordinates.error?.code).toBe('23514')
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

  it('records a pre-start first-control check-in at the event start time (real DB)', async () => {
    const tapTime = Date.now()
    const result = await checkInAtControl(soonToken, {
      controlId: IDS.controlSoonStart,
      checkedInAt: new Date(tapTime).toISOString(), // tap now — 30 min before the start
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracyM: 10,
    })

    expect(result.success).toBe(true)
    const { data: row } = await supabase
      .from('control_checkins')
      .select('checked_in_at')
      .eq('registration_id', IDS.regSoon)
      .eq('control_id', IDS.controlSoonStart)
      .single()

    // Stored time is exactly the seeded event start (clamped forward past
    // the tap), not merely "later than the tap" — and the action's response
    // reflects the stored value.
    expect(new Date(row!.checked_in_at).getTime()).toBe(soonEventStart.getTime())
    expect(new Date(row!.checked_in_at).getTime()).toBeGreaterThan(tapTime)
    expect(new Date(result.data!.checkin.checkedInAt).getTime()).toBe(
      new Date(row!.checked_in_at).getTime()
    )
  })

  it('adds GPS to a pre-start first-control row recorded at the start time (real DB)', async () => {
    // A row at the start control is recorded at the official start, so its
    // checked_in_at sits in the future while riders wait at the line. The GPS
    // retry echoes that server-issued time back; reading it as a device clock
    // claiming to be from the future would refuse the upgrade and drop the fix.
    await checked(
      supabase
        .from('control_checkins')
        .delete()
        .eq('registration_id', IDS.regSoon)
        .eq('control_id', IDS.controlSoonStart),
      'clear pre-start check-in'
    )

    const manual = await checkInAtControl(soonToken, {
      controlId: IDS.controlSoonStart,
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 45_000,
        context: 'browser',
      },
    })
    expect(manual.success).toBe(true)
    expect(manual.data!.checkin.method).toBe('manual')
    const recordedAt = new Date(manual.data!.checkin.checkedInAt).getTime()
    expect(recordedAt).toBe(soonEventStart.getTime())
    expect(recordedAt).toBeGreaterThan(Date.now())

    const upgraded = await checkInAtControl(soonToken, {
      controlId: IDS.controlSoonStart,
      checkedInAt: manual.data!.checkin.checkedInAt,
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracyM: 10,
      expectedManualReceivedAt: manual.data!.checkin.receivedAt,
    })

    expect(upgraded.success).toBe(true)
    expect(upgraded.data!.upgradedFromManual).toBe(true)

    const { data: upgradedRow } = await supabase
      .from('control_checkins')
      .select('method, lat, checked_in_at, location_failure_reason')
      .eq('registration_id', IDS.regSoon)
      .eq('control_id', IDS.controlSoonStart)
      .single()

    expect(upgradedRow!.method).toBe('gps')
    expect(upgradedRow!.lat).not.toBeNull()
    expect(upgradedRow!.location_failure_reason).toBeNull()
    // The upgrade enriches the row; it never rewrites the recorded start.
    expect(new Date(upgradedRow!.checked_in_at).getTime()).toBe(soonEventStart.getTime())
  })
})
