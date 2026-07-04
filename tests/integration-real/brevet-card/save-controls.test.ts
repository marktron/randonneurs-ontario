import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from '../registration/helpers'
import { saveEventControls } from '@/lib/actions/event-controls'

// saveEventControls requires an admin session and writes an audit log row.
// There is no auth session in this suite, and audit_logs.admin_id has a
// NOT NULL FK to admins(id), so a fake admin id would violate it — mock both
// so the action itself runs against the real DB.
vi.mock('@/lib/auth/get-admin', () => ({
  getAdmin: vi.fn(async () => ({ id: '00000000-5a7e-4000-a000-0000000000ad' })),
  requireAdmin: vi.fn(async () => ({ id: '00000000-5a7e-4000-a000-0000000000ad' })),
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => {}),
}))

const IDS = {
  event: '00000000-5a7e-4000-a000-000000000001',
  rider: '00000000-5a7e-4000-a000-000000000002',
  registration: '00000000-5a7e-4000-a000-000000000003',
}

const RIDER_EMAIL = 'inttest-save-controls@example.com'
const EVENT_SLUG_PREFIX = 'inttest-save-controls-'

interface ControlRow {
  id: string
  position: number
  name: string
  distance_km: number
  radius_m: number
  notes: string | null
  created_at: string
  updated_at: string
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('control_checkins').delete().eq('registration_id', IDS.registration)
  await supabase.from('event_controls').delete().eq('event_id', IDS.event)
  await supabase.from('registrations').delete().eq('event_id', IDS.event)
  await supabase.from('events').delete().eq('id', IDS.event)
  // Also by natural key: the slug embeds a relative date, so a leftover row
  // from an interrupted run on another day has the fixed id above but a
  // different slug — and vice versa for a colliding slug without our id.
  await supabase.from('events').delete().ilike('slug', `${EVENT_SLUG_PREFIX}%`)
  await supabase.from('riders').delete().eq('id', IDS.rider)
  await supabase.from('riders').delete().ilike('email', RIDER_EMAIL)
}

describe('saveEventControls (real DB)', () => {
  const supabase = getTestSupabase()

  /**
   * Reset the event to a known-mutable state and (re)seed exactly three
   * controls through the system under test, so every test starts from the
   * same rows regardless of order or previous runs.
   */
  async function seedControls(): Promise<ControlRow[]> {
    await checked(
      supabase.from('events').update({ status: 'scheduled' }).eq('id', IDS.event),
      'reset event status'
    )
    await supabase.from('control_checkins').delete().eq('registration_id', IDS.registration)
    await supabase.from('event_controls').delete().eq('event_id', IDS.event)

    const result = await saveEventControls(IDS.event, [
      { name: 'Start', distanceKm: 0, lat: null, lng: null, radiusM: 500 },
      { name: 'Mid', distanceKm: 100, lat: null, lng: null, radiusM: 500 },
      { name: 'Finish', distanceKm: 200, lat: null, lng: null, radiusM: 500 },
    ])
    expect(result.success).toBe(true)

    return readControls()
  }

  /** Controls for the test event, ordered by position. */
  async function readControls(): Promise<ControlRow[]> {
    const rows = await checked(
      supabase
        .from('event_controls')
        .select('id, position, name, distance_km, radius_m, notes, created_at, updated_at')
        .eq('event_id', IDS.event)
        .order('position', { ascending: true }),
      'read controls'
    )
    return rows as ControlRow[]
  }

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-save-controls-rider',
        first_name: 'Save',
        last_name: 'Controls',
        email: RIDER_EMAIL,
      }),
      'insert rider'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.event,
        slug: `${EVENT_SLUG_PREFIX}${daysFromNow(14)}`,
        chapter_id: TORONTO_CHAPTER_ID,
        name: 'IntTest Save Controls',
        event_type: 'brevet',
        distance_km: 200,
        event_date: daysFromNow(14),
        start_time: '08:00',
        status: 'scheduled',
      }),
      'insert event'
    )

    await checked(
      supabase
        .from('registrations')
        .insert({ id: IDS.registration, event_id: IDS.event, rider_id: IDS.rider }),
      'insert registration'
    )
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('reordering kept controls survives the UNIQUE (event_id, position) constraint', async () => {
    const seeded = await seedControls()
    expect(seeded.map((c) => [c.name, c.position])).toEqual([
      ['Start', 1],
      ['Mid', 2],
      ['Finish', 3],
    ])
    const byName = new Map(seeded.map((c) => [c.name, c]))

    // Same three rows, distances changed so the route order fully reverses.
    // Without the negative-position shift pass this save 23505s: the unique
    // constraint is non-deferrable and Postgres checks it per row, so writing
    // Finish's new position (1) would collide with Start still sitting at 1.
    const result = await saveEventControls(IDS.event, [
      {
        id: byName.get('Start')!.id,
        name: 'Start',
        distanceKm: 200,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Mid')!.id,
        name: 'Mid',
        distanceKm: 100,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Finish')!.id,
        name: 'Finish',
        distanceKm: 0,
        lat: null,
        lng: null,
        radiusM: 500,
      },
    ])
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()

    const after = await readControls()
    expect(after.map((c) => c.position)).toEqual([1, 2, 3])
    expect(after.map((c) => c.name)).toEqual(['Finish', 'Mid', 'Start'])
    expect(after.map((c) => Number(c.distance_km))).toEqual([0, 100, 200])
    // Kept rows were updated in place, not recreated.
    expect(after.map((c) => c.id)).toEqual([
      byName.get('Finish')!.id,
      byName.get('Mid')!.id,
      byName.get('Start')!.id,
    ])
  })

  it('mixed save: keeps two (reordered), drops one, inserts a new one', async () => {
    const seeded = await seedControls()
    const byName = new Map(seeded.map((c) => [c.name, c]))
    const seededIds = new Set(seeded.map((c) => c.id))

    const result = await saveEventControls(IDS.event, [
      // Finish moves to the front, Start moves to the middle, Mid is dropped,
      // and a brand-new control lands at the end.
      {
        id: byName.get('Finish')!.id,
        name: 'Finish',
        distanceKm: 0,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Start')!.id,
        name: 'Start',
        distanceKm: 50,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      { name: 'Brand New', distanceKm: 120, lat: null, lng: null, radiusM: 300 },
    ])
    expect(result.success).toBe(true)

    const after = await readControls()
    expect(after.map((c) => [c.name, c.position, Number(c.distance_km)])).toEqual([
      ['Finish', 1, 0],
      ['Start', 2, 50],
      ['Brand New', 3, 120],
    ])
    // Kept ids preserved.
    expect(after[0].id).toBe(byName.get('Finish')!.id)
    expect(after[1].id).toBe(byName.get('Start')!.id)
    // The new row got a fresh DB-generated id.
    expect(after[2].id).toBeTruthy()
    expect(seededIds.has(after[2].id)).toBe(false)
    // The dropped id is gone.
    expect(after.map((c) => c.id)).not.toContain(byName.get('Mid')!.id)
  })

  it('the updated_at trigger fires on the upsert path', async () => {
    const seeded = await seedControls()
    const byName = new Map(seeded.map((c) => [c.name, c]))
    const before = new Map(seeded.map((c) => [c.id, c.updated_at]))

    // Ensure the clock advances past now() of the insert statement.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const result = await saveEventControls(IDS.event, [
      {
        id: byName.get('Start')!.id,
        name: 'Start',
        distanceKm: 200,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Mid')!.id,
        name: 'Mid',
        distanceKm: 100,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Finish')!.id,
        name: 'Finish',
        distanceKm: 0,
        lat: null,
        lng: null,
        radiusM: 500,
      },
    ])
    expect(result.success).toBe(true)

    const after = await readControls()
    for (const row of after) {
      const previous = before.get(row.id)!
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(previous).getTime())
      expect(row.updated_at).not.toBe(row.created_at)
    }
  })

  it('dropping a control cascade-deletes its check-ins', async () => {
    const seeded = await seedControls()
    const byName = new Map(seeded.map((c) => [c.name, c]))
    const midId = byName.get('Mid')!.id

    await checked(
      supabase.from('control_checkins').insert({
        control_id: midId,
        registration_id: IDS.registration,
        checked_in_at: new Date().toISOString(),
        method: 'manual',
      }),
      'insert check-in'
    )

    const result = await saveEventControls(IDS.event, [
      {
        id: byName.get('Start')!.id,
        name: 'Start',
        distanceKm: 0,
        lat: null,
        lng: null,
        radiusM: 500,
      },
      {
        id: byName.get('Finish')!.id,
        name: 'Finish',
        distanceKm: 200,
        lat: null,
        lng: null,
        radiusM: 500,
      },
    ])
    expect(result.success).toBe(true)

    const after = await readControls()
    expect(after.map((c) => c.name)).toEqual(['Start', 'Finish'])
    expect(after.map((c) => c.id)).not.toContain(midId)

    const checkins = await checked(
      supabase.from('control_checkins').select('id').eq('control_id', midId),
      'read check-ins after delete'
    )
    expect((checkins as unknown[]).length).toBe(0)
  })

  it('refuses to save once results are submitted, leaving controls and check-ins intact', async () => {
    const seeded = await seedControls()
    const byName = new Map(seeded.map((c) => [c.name, c]))
    const midId = byName.get('Mid')!.id

    await checked(
      supabase.from('control_checkins').insert({
        control_id: midId,
        registration_id: IDS.registration,
        checked_in_at: new Date().toISOString(),
        method: 'manual',
      }),
      'insert check-in'
    )

    await checked(
      supabase.from('events').update({ status: 'submitted' }).eq('id', IDS.event),
      'freeze event'
    )

    try {
      // This save would delete Mid and cascade away its check-in — the freeze
      // gate must reject it before any write happens.
      const result = await saveEventControls(IDS.event, [
        {
          id: byName.get('Start')!.id,
          name: 'Start',
          distanceKm: 0,
          lat: null,
          lng: null,
          radiusM: 500,
        },
        {
          id: byName.get('Finish')!.id,
          name: 'Finish',
          distanceKm: 200,
          lat: null,
          lng: null,
          radiusM: 500,
        },
      ])
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/frozen/i)

      const after = await readControls()
      expect(after.map((c) => c.name)).toEqual(['Start', 'Mid', 'Finish'])
      expect(after.map((c) => c.id)).toContain(midId)

      const checkins = await checked(
        supabase.from('control_checkins').select('id').eq('control_id', midId),
        'read check-ins after refused save'
      )
      expect((checkins as unknown[]).length).toBe(1)
    } finally {
      // Un-freeze so afterAll cleanup (and reruns) start from a mutable event.
      await supabase.from('events').update({ status: 'scheduled' }).eq('id', IDS.event)
    }
  })
})
