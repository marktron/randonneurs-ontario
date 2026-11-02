import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

/**
 * Trigger `trg_events_propagate_distance` (migration 20261102120000):
 * when an event's distance_km changes, results on that event that still carry
 * the OLD event distance follow it. Per-rider overrides (a different distance)
 * and flèche events (team distance lives on the result) are left alone.
 *
 * Regression for the Jumbo's 2-Port Romp case (2026-04-12): the organizer
 * corrected the populaire from 75 to 80 km after results were in, every
 * finisher's result stayed at 75, and a rider finished the season at 4997 km
 * with no O-5000.
 */

const supabase = getTestSupabase()
const CURRENT_SEASON = new Date().getFullYear()

// '0000000000'+'9x' block is unused by the other real-DB suites.
const IDS = {
  riderA: '00000000-0000-4000-a000-000000000091',
  riderB: '00000000-0000-4000-a000-000000000092',
  route: '00000000-0000-4000-a000-000000000093',
}
const RIDER_IDS = [IDS.riderA, IDS.riderB]
const PREFIX = 'inttest-evdist'

let chapterIds: Record<string, string>
let o5000AwardId: string
let seq = 0

beforeAll(async () => {
  const chapters = await checked(supabase.from('chapters').select('id, slug'), 'load chapters')
  chapterIds = Object.fromEntries(
    (chapters as { id: string; slug: string }[]).map((c) => [c.slug, c.id])
  )
  for (const slug of ['huron', 'other'] as const) {
    if (!chapterIds[slug]) throw new Error(`[integration-real] chapter ${slug} not seeded`)
  }
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'o-5000').single(),
    'load O-5000 award id'
  )
  o5000AwardId = (award as { id: string }).id

  await cleanup()
  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: `${PREFIX}-route`,
      chapter_id: chapterIds.huron,
      name: 'IntTest EvDist Route',
      distance_km: 80,
      collection: null,
    }),
    'seed route'
  )
  await checked(
    supabase.from('riders').upsert(
      [
        { id: IDS.riderA, slug: `${PREFIX}-rider-a`, first_name: 'IntTest', last_name: 'EvDistA' },
        { id: IDS.riderB, slug: `${PREFIX}-rider-b`, first_name: 'IntTest', last_name: 'EvDistB' },
      ],
      { onConflict: 'id' }
    ),
    'seed riders'
  )
})

async function cleanup(): Promise<void> {
  await supabase.from('results').delete().in('rider_id', RIDER_IDS)
  await supabase.from('rider_awards').delete().in('rider_id', RIDER_IDS)
  await supabase.from('events').delete().like('slug', `${PREFIX}-%`)
  await supabase.from('events').delete().eq('route_id', IDS.route)
}

afterEach(cleanup)

afterAll(async () => {
  await cleanup()
  await supabase.from('riders').delete().in('id', RIDER_IDS)
  await supabase.from('riders').delete().like('slug', `${PREFIX}-%`)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('routes').delete().eq('slug', `${PREFIX}-route`)
})

async function seedEvent(
  distance: number,
  opts: { eventType?: string; chapter?: 'huron' | 'other' } = {}
): Promise<string> {
  seq += 1
  const id = `00000000-0000-4000-a000-0000000009${String(seq).padStart(2, '0')}`
  await checked(
    supabase.from('events').insert({
      id,
      slug: `${PREFIX}-${seq}`,
      name: `IntTest EvDist ${seq}`,
      chapter_id: chapterIds[opts.chapter ?? 'huron'],
      route_id: IDS.route,
      event_type: opts.eventType ?? 'populaire',
      distance_km: distance,
      event_date: `${CURRENT_SEASON}-04-11`,
      status: 'completed',
    }),
    `seed event ${seq}`
  )
  return id
}

async function seedResult(eventId: string, riderId: string, distance: number): Promise<void> {
  await checked(
    supabase.from('results').insert({
      event_id: eventId,
      rider_id: riderId,
      status: 'finished',
      season: CURRENT_SEASON,
      distance_km: distance,
    }),
    `seed result ${riderId}`
  )
}

async function resultDistances(eventId: string): Promise<Record<string, number | null>> {
  const rows = await checked(
    supabase.from('results').select('rider_id, distance_km').eq('event_id', eventId),
    'read results'
  )
  return Object.fromEntries(
    (rows as { rider_id: string; distance_km: number | null }[]).map((r) => [
      r.rider_id,
      r.distance_km,
    ])
  )
}

async function setEventDistance(eventId: string, distance: number): Promise<void> {
  await checked(
    supabase.from('events').update({ distance_km: distance }).eq('id', eventId),
    'update event distance'
  )
}

describe('events.distance_km propagates to results', () => {
  it('moves results that carried the old event distance to the new one', async () => {
    const eventId = await seedEvent(75)
    await seedResult(eventId, IDS.riderA, 75)
    await seedResult(eventId, IDS.riderB, 75)

    await setEventDistance(eventId, 80)

    expect(await resultDistances(eventId)).toEqual({ [IDS.riderA]: 80, [IDS.riderB]: 80 })
  })

  it('leaves a per-rider override that differs from the old event distance alone', async () => {
    const eventId = await seedEvent(75)
    await seedResult(eventId, IDS.riderA, 75)
    await seedResult(eventId, IDS.riderB, 60) // rode a shortened course

    await setEventDistance(eventId, 80)

    expect(await resultDistances(eventId)).toEqual({ [IDS.riderA]: 80, [IDS.riderB]: 60 })
  })

  it('does not touch flèche results (team distance is per result)', async () => {
    const eventId = await seedEvent(360, { eventType: 'fleche', chapter: 'other' })
    await seedResult(eventId, IDS.riderA, 360)

    await setEventDistance(eventId, 400)

    expect(await resultDistances(eventId)).toEqual({ [IDS.riderA]: 360 })
  })

  it('ignores event updates that do not change distance_km', async () => {
    const eventId = await seedEvent(75)
    await seedResult(eventId, IDS.riderA, 75)
    await checked(
      supabase.from('events').update({ name: 'Renamed' }).eq('id', eventId),
      'rename event'
    )
    expect(await resultDistances(eventId)).toEqual({ [IDS.riderA]: 75 })
  })

  it('chains into O-5000 reconciliation (the Jumbo 2-Port Romp case)', async () => {
    // 4922 km of unambiguous brevets + a 75 km populaire = 4997: no award.
    const populaireId = await seedEvent(75)
    await seedResult(populaireId, IDS.riderA, 75)
    for (const d of [1200, 1200, 1200, 1000, 322]) {
      const e = await seedEvent(d, { eventType: 'brevet' })
      await seedResult(e, IDS.riderA, d)
    }
    const before = await supabase
      .from('rider_awards')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', IDS.riderA)
      .eq('award_id', o5000AwardId)
      .eq('season', CURRENT_SEASON)
    expect(before.count).toBe(0)

    // Organizer corrects the populaire to 80 km after the fact: 5002.
    await setEventDistance(populaireId, 80)

    const after = await supabase
      .from('rider_awards')
      .select('id, auto_assigned', { count: 'exact' })
      .eq('rider_id', IDS.riderA)
      .eq('award_id', o5000AwardId)
      .eq('season', CURRENT_SEASON)
    expect(after.count).toBe(1)
    expect(after.data?.[0]?.auto_assigned).toBe(true)
  })
})
