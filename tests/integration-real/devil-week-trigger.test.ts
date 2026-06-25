import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

const supabase = getTestSupabase()
const CHAPTER_ID = TORONTO_CHAPTER_ID

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

const IDS = {
  rider: '00000000-0000-4000-a000-0000000000e1',
  route: '00000000-0000-4000-a000-0000000000e3',
}
const SLUGS = { rider: 'inttest-dw-rider-a' }
const ALL_RIDER_IDS = [IDS.rider]

let dwAwardId: string
let eventSeq = 0
let resultSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'completed-devil-week').single(),
    'load Devil Week award id'
  )
  dwAwardId = (award as { id: string }).id

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-dw-route',
      chapter_id: CHAPTER_ID,
      name: 'IntTest DW Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )
})

afterEach(async () => {
  // Deleting results cascades their result_awards rows (FK ON DELETE CASCADE).
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
})

afterAll(async () => {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
})

async function seedRider(id: string, slug: string): Promise<void> {
  await checked(
    supabase
      .from('riders')
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'DevilWeek' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// One tagged Devil Week event in `season` at `distance`. events.season is a
// GENERATED column from event_date, so we set event_date (not season).
async function seedDevilWeekEvent(season: number, distance: number): Promise<string> {
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-0000000e1${String(eventSeq).padStart(3, '0')}`
  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-dw-${eventSeq}`,
      name: `IntTest Devil Week ${eventSeq}`,
      chapter_id: CHAPTER_ID,
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: distance,
      event_date: `${season}-06-15`,
      status: 'completed',
      collection: 'devil-week',
    }),
    `seed dw event ${eventSeq}`
  )
  return eventId
}

// The full four-event series for a season; returns event ids in 200/300/400/600 order.
async function seedDevilWeekSeason(
  season: number,
  distances: number[] = [200, 300, 400, 600]
): Promise<string[]> {
  const ids: string[] = []
  for (const d of distances) ids.push(await seedDevilWeekEvent(season, d))
  return ids
}

// A result for (rider, event). Pass finishTime: null to test the finish_time rule.
async function seedResult(
  riderId: string,
  eventId: string,
  distance: number,
  season: number,
  opts: { status?: string; finishTime?: string | null } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const finishTime = opts.finishTime !== undefined ? opts.finishTime : '13:30:00'
  resultSeq += 1
  const resultId = `00000000-0000-4000-a000-0000000e2${String(resultSeq).padStart(3, '0')}`
  await checked(
    supabase.from('results').insert({
      id: resultId,
      event_id: eventId,
      rider_id: riderId,
      status,
      finish_time: finishTime,
      season,
      distance_km: distance,
    }),
    `seed result ${resultSeq}`
  )
  return resultId
}

// Count of completed-devil-week award rows on this rider's results in `season`.
async function devilWeekCount(riderId: string, season: number): Promise<number> {
  const { data, error } = await supabase
    .from('result_awards')
    .select('result_id, results!inner(rider_id, season)')
    .eq('award_id', dwAwardId)
    .eq('results.rider_id', riderId)
    .eq('results.season', season)
  if (error) throw new Error(`devilWeekCount: ${error.message}`)
  return (data ?? []).length
}

describe('Completed Devil Week auto-assignment trigger', () => {
  it('tags all four results when the full series is finished (current season)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)
  })

  it('does not award for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(PRIOR_SEASON)
    await seedResult(IDS.rider, e200, 200, PRIOR_SEASON)
    await seedResult(IDS.rider, e300, 300, PRIOR_SEASON)
    await seedResult(IDS.rider, e400, 400, PRIOR_SEASON)
    await seedResult(IDS.rider, e600, 600, PRIOR_SEASON)
    expect(await devilWeekCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('does not award when only three of four are finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON, { status: 'dnf' })
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('does not award when a finished ride has no finish_time', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON, { finishTime: null })
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the award when a qualifying result flips to dnf', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    const last = await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)

    await checked(
      supabase.from('results').update({ status: 'dnf' }).eq('id', last),
      'flip 600 to dnf'
    )
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the award when a qualifying result is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    const last = await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)

    await checked(supabase.from('results').delete().eq('id', last), 'delete 600')
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('does not award when the season has fewer than four tagged events', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400] = await seedDevilWeekSeason(CURRENT_SEASON, [200, 300, 400])
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('awards the tagged series and ignores an untagged finished brevet', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    // Seed the full four-event tagged series and finish all four.
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)

    // Add an untagged finished brevet using the module-level eventSeq so the
    // slug is unique and the insert is idempotent across re-runs.
    eventSeq += 1
    const untaggedId = `00000000-0000-4000-a000-0000000e1${String(eventSeq).padStart(3, '0')}`
    await checked(
      supabase.from('events').insert({
        id: untaggedId,
        slug: `inttest-dw-untagged-${eventSeq}`,
        name: `IntTest Untagged 600 (${eventSeq})`,
        chapter_id: CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 600,
        event_date: `${CURRENT_SEASON}-06-15`,
        status: 'completed',
        collection: null,
      }),
      'seed untagged event'
    )
    await seedResult(IDS.rider, untaggedId, 600, CURRENT_SEASON)

    // The four tagged results are awarded; the untagged ride is neither awarded
    // nor blocks the series.
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)
  })
})
