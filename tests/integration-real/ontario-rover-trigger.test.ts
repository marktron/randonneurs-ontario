import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

const supabase = getTestSupabase()

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000c1',
  riderB: '00000000-0000-4000-a000-0000000000c2',
  route: '00000000-0000-4000-a000-0000000000c3',
}
const SLUGS = {
  rider: 'inttest-rover-rider-a',
  riderB: 'inttest-rover-rider-b',
}
const ALL_RIDER_IDS = [IDS.rider, IDS.riderB]

let awardId: string
let permanentChapterId: string
let eventSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'ontario-rover').single(),
    'load Ontario Rover award id'
  )
  awardId = (award as { id: string }).id

  const chapter = await checked(
    supabase.from('chapters').select('id').eq('slug', 'permanent').single(),
    'load permanent chapter id'
  )
  permanentChapterId = (chapter as { id: string }).id

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-rover-route',
      chapter_id: permanentChapterId,
      name: 'IntTest Rover Route',
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
  eventSeq = 0
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
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'Rover' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// Create a finished permanent result of `distance` km for `rider` in `season`.
// Each call gets a later event_date within the season than the last, so rides
// seeded in sequence replay in that order. Returns the result id.
async function seedResult(
  riderId: string,
  distance: number,
  season: number,
  opts: { status?: string; eventType?: string } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const eventType = opts.eventType ?? 'permanent'
  eventSeq += 1
  const month = String(1 + Math.floor((eventSeq - 1) / 28)).padStart(2, '0')
  const day = String(1 + ((eventSeq - 1) % 28)).padStart(2, '0')
  const eventId = `00000000-0000-4000-a000-00000000e${String(eventSeq + 500).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000f${String(eventSeq + 500).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-rover-${eventSeq}`,
      name: `IntTest Rover Event ${eventSeq}`,
      chapter_id: permanentChapterId,
      route_id: IDS.route,
      event_type: eventType,
      distance_km: distance,
      event_date: `${season}-${month}-${day}`,
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

async function seedMany(riderId: string, distances: number[], season: number): Promise<string[]> {
  const ids: string[] = []
  for (const d of distances) ids.push(await seedResult(riderId, d, season))
  return ids
}

async function awardCount(riderId: string, season: number, autoAssigned: boolean): Promise<number> {
  const { count, error } = await supabase
    .from('rider_awards')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('award_id', awardId)
    .eq('season', season)
    .eq('auto_assigned', autoAssigned)
  if (error) throw new Error(`awardCount: ${error.message}`)
  return count ?? 0
}
const autoCount = (riderId: string, season: number) => awardCount(riderId, season, true)
const manualCount = (riderId: string, season: number) => awardCount(riderId, season, false)

describe('Ontario Rover auto-assignment trigger', () => {
  it('grants the award at 1200 km with two 300+ km permanents', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300, 200, 200], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('grants nothing at 1200 km with only one 300+ km permanent', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 200, 200, 200, 200, 200], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('waits for the second 300 when 1200 km is reached first', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [200, 200, 200, 200, 200, 200, 300], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await seedResult(IDS.rider, 300, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('counts 400 and 600 km permanents as 300+', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [400, 600, 200], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('starts a fresh window after each award: nothing carries over', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // Window 1 closes at 300/300/600 (1200 km, 2x300+).
    await seedMany(IDS.rider, [300, 300, 600], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    // Window 2 needs its own two 300s and its own 1200 km.
    await seedMany(IDS.rider, [300, 300, 200], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    await seedResult(IDS.rider, 400, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(2)
  })

  it('surplus km in a closed window does not seed the next one', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // 2400 km and 2x300+ total, but both 300s are consumed by window 1; the
    // second 1200 km is all sub-300 rides.
    await seedMany(IDS.rider, [300, 300, 600, 200, 200, 200, 200, 200, 200], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('accumulates across seasons: prior-season rides count toward a current-season award', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300, 400], PRIOR_SEASON)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('ignores permanents ridden before the award existed (2025)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // Absolute cutoff by design: the award was created in 2025, so 2024 rides
    // can never count, no matter what the current season is.
    await seedMany(IDS.rider, [300, 300, 400], 2024)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await autoCount(IDS.rider, 2024)).toBe(0)
  })

  it('never writes a window that closed in a prior (frozen) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300, 600], PRIOR_SEASON)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
    // A current-season ride starts a fresh window; the closed one stays closed.
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('ignores non-permanent results', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300], CURRENT_SEASON)
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { eventType: 'brevet' })
    await seedResult(IDS.rider, 360, CURRENT_SEASON, { eventType: 'fleche' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('ignores dnf and pending results', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300, 200], CURRENT_SEASON)
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { status: 'dnf' })
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { status: 'pending' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('grants the award when the pending ride that closes the window is marked finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedMany(IDS.rider, [300, 300, 200, 200], CURRENT_SEASON)
    const id = await seedResult(IDS.rider, 200, CURRENT_SEASON, { status: 'pending' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('id', id),
      'finish result'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('removes the award when the closing ride flips to dnf', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids = await seedMany(IDS.rider, [300, 300, 600], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    await checked(
      supabase.from('results').update({ status: 'dnf' }).eq('id', ids[2]),
      'flip to dnf'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the award when a ride in the window is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids = await seedMany(IDS.rider, [300, 300, 600], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    await checked(supabase.from('results').delete().eq('id', ids[0]), 'delete first 300')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('re-evaluates the current season when a prior-season ride changes', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const prior = await seedMany(IDS.rider, [300, 300, 500], PRIOR_SEASON)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    // Removing the prior 500 leaves 300+300+200 = 800 km: window reopens.
    await checked(supabase.from('results').delete().eq('id', prior[2]), 'delete prior 500')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('re-evaluates when a result distance is corrected', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // 1200 km with a single 300+: not yet earned.
    const ids = await seedMany(IDS.rider, [300, 200, 200, 200, 200, 100], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await checked(
      supabase.from('results').update({ distance_km: 300 }).eq('id', ids[1]),
      'correct 200 to 300'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('moves the award when a result is reassigned to another rider', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedRider(IDS.riderB, SLUGS.riderB)
    const ids = await seedMany(IDS.rider, [300, 300, 600], CURRENT_SEASON)
    await seedMany(IDS.riderB, [300, 300], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await autoCount(IDS.riderB, CURRENT_SEASON)).toBe(0)

    await checked(
      supabase.from('results').update({ rider_id: IDS.riderB }).eq('id', ids[2]),
      'reassign the 600'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await autoCount(IDS.riderB, CURRENT_SEASON)).toBe(1)
  })

  it('never touches manual rows and stacks additively', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await checked(
      supabase.from('rider_awards').insert({
        rider_id: IDS.rider,
        award_id: awardId,
        season: CURRENT_SEASON,
        auto_assigned: false,
        note: 'Hand-assigned',
      }),
      'seed manual award'
    )
    await seedMany(IDS.rider, [300, 300, 600], CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })
})
