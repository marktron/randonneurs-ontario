import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

const supabase = getTestSupabase()
const CHAPTER_ID = TORONTO_CHAPTER_ID

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000a1',
  riderB: '00000000-0000-4000-a000-0000000000a2',
  route: '00000000-0000-4000-a000-0000000000b1',
}
const SLUGS = {
  rider: 'inttest-sr-rider-a',
  riderB: 'inttest-sr-rider-b',
}
const ALL_RIDER_IDS = [IDS.rider, IDS.riderB]

let srAwardId: string
let eventSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'super-randonneur').single(),
    'load SR award id'
  )
  srAwardId = (award as { id: string }).id

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-sr-route',
      chapter_id: CHAPTER_ID,
      name: 'IntTest SR Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )
})

afterEach(async () => {
  // Results first (FK), then events; riders/route dropped in afterAll.
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('rider_awards').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
})

afterAll(async () => {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('rider_awards').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
})

async function seedRider(id: string, slug: string): Promise<void> {
  await checked(
    supabase
      .from('riders')
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'SR' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// Create a finished brevet result at `distance` for `rider` in `season`.
// Returns the result id so tests can update/delete it.
async function seedResult(
  riderId: string,
  distance: number,
  season: number,
  opts: { status?: string; eventType?: string } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const eventType = opts.eventType ?? 'brevet'
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-00000000c${String(eventSeq).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000d${String(eventSeq).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-sr-${eventSeq}`,
      name: `IntTest SR Event ${eventSeq}`,
      chapter_id: CHAPTER_ID,
      route_id: IDS.route,
      event_type: eventType,
      distance_km: distance,
      event_date: `${season}-06-15`,
      status: 'completed',
    }),
    `seed event ${eventSeq}`
  )
  await checked(
    supabase.from('results').insert({
      id: resultId,
      event_id: eventId,
      rider_id: riderId,
      status,
      season,
      distance_km: distance,
    }),
    `seed result ${eventSeq}`
  )
  return resultId
}

async function autoSrCount(riderId: string, season: number): Promise<number> {
  const { count, error } = await supabase
    .from('rider_awards')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('award_id', srAwardId)
    .eq('season', season)
    .eq('auto_assigned', true)
  if (error) throw new Error(`autoSrCount: ${error.message}`)
  return count ?? 0
}

async function manualSrCount(riderId: string, season: number): Promise<number> {
  const { count, error } = await supabase
    .from('rider_awards')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('award_id', srAwardId)
    .eq('season', season)
    .eq('auto_assigned', false)
  if (error) throw new Error(`manualSrCount: ${error.message}`)
  return count ?? 0
}

describe('Super Randonneur auto-assignment trigger', () => {
  it('grants one SR for a full 200/300/400/600 series in the current season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('grants the SR as soon as the last pending result is marked finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // complete-event.ts creates result rows as `pending`; riders (or an admin)
    // flip them to `finished` afterwards. Nothing is earned until the last one.
    const ids: string[] = []
    for (const d of [200, 300, 400, 600]) {
      ids.push(await seedResult(IDS.rider, d, CURRENT_SEASON, { status: 'pending' }))
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)

    for (const id of ids.slice(0, 3)) {
      await checked(
        supabase.from('results').update({ status: 'finished' }).eq('id', id),
        'finish result'
      )
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)

    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('id', ids[3]),
      'finish final result'
    )
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not substitute a longer ride for a shorter slot: 200/400/400/600 earns nothing', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 400, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('does not grant SR for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, PRIOR_SEASON)
    }
    expect(await autoSrCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('is idempotent: an incomplete series grants nothing', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('grants multiple SRs when the series is repeated (unlimited)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600, 200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(2)
  })

  it('is limited by the scarcest distance: 3x200 2x300 2x400 1x600 -> 1 SR', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 200, 200, 300, 300, 400, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not let a ride over 600 stand in for a missing distance: 200/300/600/1000 earns nothing', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 600, 1000]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('does not let a 1000 fill the 600 slot: 200/300/400/1000 earns nothing', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 1000]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('ignores rides outside the set: a full series plus a 1000 and a 1200 is still one SR', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600, 1000, 1200]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('removes the SR when a qualifying result flips to dnf', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, 400, CURRENT_SEASON)
    const sixHundredId = await seedResult(IDS.rider, 600, CURRENT_SEASON)
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await checked(
      supabase.from('results').update({ status: 'dnf' }).eq('id', sixHundredId),
      'flip 600 to dnf'
    )
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the SR when a qualifying result is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, 400, CURRENT_SEASON)
    const sixHundredId = await seedResult(IDS.rider, 600, CURRENT_SEASON)
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await checked(supabase.from('results').delete().eq('id', sixHundredId), 'delete 600')
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('ignores non-brevet results (permanent, fleche)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, 400, CURRENT_SEASON, { eventType: 'permanent' })
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { eventType: 'fleche' })
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('never touches manual rows and stacks additively', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // Pre-existing manual SR (e.g. an off-club series) for the current season.
    await checked(
      supabase.from('rider_awards').insert({
        rider_id: IDS.rider,
        award_id: srAwardId,
        season: CURRENT_SEASON,
        auto_assigned: false,
        note: 'Off-club 600 — manual',
      }),
      'seed manual SR'
    )
    // A full on-site series should add exactly one AUTO row, leaving the manual row.
    for (const d of [200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await manualSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    // Dropping the on-site series removes only the auto row; manual survives.
    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await manualSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })
})
