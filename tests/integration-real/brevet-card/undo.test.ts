import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID } from '../registration/helpers'
import { checkInAtControl, undoCheckin } from '@/lib/actions/brevet-card'
import { RIDER_UNDO_WINDOW_MS } from '@/lib/brevet-card'
import { resetRateLimitStores } from '@/lib/rate-limit'

// Distinct ID space from checkin.test.ts (…1b0c…) to avoid cross-file
// collisions when both run against the same local database.
const IDS = {
  rider: '00000000-1b0d-4000-a000-000000000001',
  activeEvent: '00000000-1b0d-4000-a000-000000000002',
  submittedEvent: '00000000-1b0d-4000-a000-000000000003',
  controlActive: '00000000-1b0d-4000-a000-000000000004',
  controlSubmitted: '00000000-1b0d-4000-a000-000000000005',
  regActive: '00000000-1b0d-4000-a000-000000000006',
  regSubmitted: '00000000-1b0d-4000-a000-000000000007',
}

const RIDER_EMAIL = 'inttest-brevet-undo@example.com'

// Union Station, Toronto — the seeded location of controlActive.
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

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const eventIds = [IDS.activeEvent, IDS.submittedEvent]
  await supabase
    .from('control_checkins')
    .delete()
    .in('registration_id', [IDS.regActive, IDS.regSubmitted])
  await supabase.from('event_controls').delete().in('event_id', eventIds)
  await supabase.from('registrations').delete().in('event_id', eventIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('riders').delete().in('id', [IDS.rider])
  // Also clean by natural key: duplicate emails from interrupted runs break
  // lookups elsewhere.
  await supabase.from('riders').delete().ilike('email', RIDER_EMAIL)
}

/** Insert a single check-in row with explicit keys (no bulk key-union trap). */
async function seedCheckin(
  supabase: ReturnType<typeof getTestSupabase>,
  row: {
    controlId: string
    registrationId: string
    method: 'gps' | 'manual' | 'admin'
    receivedAt: string
    checkedInAt: string
  }
) {
  await checked(
    supabase.from('control_checkins').insert({
      control_id: row.controlId,
      registration_id: row.registrationId,
      checked_in_at: row.checkedInAt,
      received_at: row.receivedAt,
      method: row.method,
      lat: row.method === 'gps' ? CONTROL_LAT : null,
      lng: row.method === 'gps' ? CONTROL_LNG : null,
      accuracy_m: null,
      distance_to_control_m: null,
    }),
    'seed checkin'
  )
}

describe('digital brevet card undo (real DB)', () => {
  const supabase = getTestSupabase()

  let activeToken: string
  let submittedToken: string

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.rider,
          slug: 'inttest-brevet-undo-rider',
          first_name: 'Undo',
          last_name: 'Tester',
          email: RIDER_EMAIL,
        },
      ]),
      'insert riders'
    )

    // Both events started one hour ago Toronto time — "happening now".
    const started = torontoNowParts(-60 * 60 * 1000)
    await checked(
      supabase.from('events').insert([
        {
          id: IDS.activeEvent,
          slug: `inttest-brevet-undo-active-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Undo Active',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
        {
          id: IDS.submittedEvent,
          slug: `inttest-brevet-undo-submitted-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Undo Submitted',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'submitted',
        },
      ]),
      'insert events'
    )

    await checked(
      supabase.from('event_controls').insert([
        {
          id: IDS.controlActive,
          event_id: IDS.activeEvent,
          position: 1,
          name: 'Start — Union Station',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlSubmitted,
          event_id: IDS.submittedEvent,
          position: 1,
          name: 'Submitted Start',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    // Every row sets status explicitly: supabase-js normalizes bulk inserts
    // to the union of keys and sends missing ones as NULL, bypassing the
    // column default.
    await checked(
      supabase.from('registrations').insert([
        {
          id: IDS.regActive,
          event_id: IDS.activeEvent,
          rider_id: IDS.rider,
          status: 'registered',
        },
        {
          id: IDS.regSubmitted,
          event_id: IDS.submittedEvent,
          rider_id: IDS.rider,
          status: 'registered',
        },
      ]),
      'insert registrations'
    )

    const regs = await checked(
      supabase
        .from('registrations')
        .select('id, management_token')
        .in('id', [IDS.regActive, IDS.regSubmitted]),
      'read management tokens'
    )
    const tokenById = new Map(
      (regs as { id: string; management_token: string }[]).map((r) => [r.id, r.management_token])
    )
    activeToken = tokenById.get(IDS.regActive)!
    submittedToken = tokenById.get(IDS.regSubmitted)!
  })

  afterEach(async () => {
    // Undo deletes rows; re-seed cleanly between tests for order-independence.
    await supabase
      .from('control_checkins')
      .delete()
      .in('registration_id', [IDS.regActive, IDS.regSubmitted])
    resetRateLimitStores()
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('undoes a recent check-in and deletes the row', async () => {
    const recorded = await checkInAtControl(activeToken, {
      controlId: IDS.controlActive,
      checkedInAt: new Date().toISOString(),
      lat: CONTROL_LAT,
      lng: CONTROL_LNG,
      accuracyM: 10,
    })
    expect(recorded.success).toBe(true)

    const result = await undoCheckin(activeToken, { controlId: IDS.controlActive })
    expect(result.success).toBe(true)

    const after = await checked(
      supabase
        .from('control_checkins')
        .select('id')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlActive),
      'checkins after undo'
    )
    expect((after as unknown[]).length).toBe(0)
  })

  it('rejects an undo once the window has passed (backdated received_at)', async () => {
    const now = Date.now()
    await seedCheckin(supabase, {
      controlId: IDS.controlActive,
      registrationId: IDS.regActive,
      method: 'gps',
      receivedAt: new Date(now - RIDER_UNDO_WINDOW_MS - 60 * 1000).toISOString(),
      checkedInAt: new Date(now - RIDER_UNDO_WINDOW_MS - 60 * 1000).toISOString(),
    })

    const result = await undoCheckin(activeToken, { controlId: IDS.controlActive })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/undo window has passed/i)

    // The row survives a rejected undo.
    const after = await checked(
      supabase
        .from('control_checkins')
        .select('id')
        .eq('registration_id', IDS.regActive)
        .eq('control_id', IDS.controlActive),
      'checkins after rejected undo'
    )
    expect((after as unknown[]).length).toBe(1)
  })

  it('refuses to undo an organizer (admin) check-in', async () => {
    await seedCheckin(supabase, {
      controlId: IDS.controlActive,
      registrationId: IDS.regActive,
      method: 'admin',
      receivedAt: new Date().toISOString(),
      checkedInAt: new Date().toISOString(),
    })

    const result = await undoCheckin(activeToken, { controlId: IDS.controlActive })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/organizer/i)
  })

  it('refuses to undo when the event is submitted (frozen)', async () => {
    await seedCheckin(supabase, {
      controlId: IDS.controlSubmitted,
      registrationId: IDS.regSubmitted,
      method: 'gps',
      receivedAt: new Date().toISOString(),
      checkedInAt: new Date().toISOString(),
    })

    const result = await undoCheckin(submittedToken, { controlId: IDS.controlSubmitted })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/submitted/i)
  })

  it('rejects an unknown token', async () => {
    const result = await undoCheckin('00000000-dead-4000-a000-000000000000', {
      controlId: IDS.controlActive,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('rejects when no check-in exists for the control', async () => {
    const result = await undoCheckin(activeToken, { controlId: IDS.controlActive })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/check-in not found/i)
  })
})
