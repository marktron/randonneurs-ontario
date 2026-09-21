import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

const supabase = getTestSupabase()

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

const REQUIRED = ['toronto', 'huron', 'ottawa', 'simcoe'] as const
type ChapterSlug = (typeof REQUIRED)[number] | 'niagara' | 'other' | 'permanent'

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000e1',
  riderB: '00000000-0000-4000-a000-0000000000e2',
  route: '00000000-0000-4000-a000-0000000000e3',
}
const SLUGS = {
  rider: 'inttest-oe-rider-a',
  riderB: 'inttest-oe-rider-b',
}
const ALL_RIDER_IDS = [IDS.rider, IDS.riderB]

let awardId: string
let chapterIds: Record<string, string>
let eventSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'ontario-explorer').single(),
    'load Ontario Explorer award id'
  )
  awardId = (award as { id: string }).id

  const chapters = await checked(supabase.from('chapters').select('id, slug'), 'load chapters')
  chapterIds = Object.fromEntries(
    (chapters as { id: string; slug: string }[]).map((c) => [c.slug, c.id])
  )
  for (const slug of REQUIRED) {
    if (!chapterIds[slug]) throw new Error(`[integration-real] chapter ${slug} not seeded`)
  }

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-oe-route',
      chapter_id: chapterIds.toronto,
      name: 'IntTest OE Route',
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
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'OE' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// Create a finished brevet result in `chapter` for `rider` in `season`.
// Returns the result id so tests can update/delete it.
async function seedResult(
  riderId: string,
  chapter: ChapterSlug,
  season: number,
  opts: { status?: string; eventType?: string; distance?: number } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const eventType = opts.eventType ?? 'brevet'
  const distance = opts.distance ?? 200
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-00000000e${String(eventSeq).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000f${String(eventSeq).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-oe-${eventSeq}`,
      name: `IntTest OE Event ${eventSeq}`,
      chapter_id: chapterIds[chapter],
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

async function seedAllFour(riderId: string, season: number): Promise<string[]> {
  const ids: string[] = []
  for (const chapter of REQUIRED) ids.push(await seedResult(riderId, chapter, season))
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

describe('Ontario Explorer auto-assignment trigger', () => {
  it('grants the award for a finished brevet in each of the four chapters', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedAllFour(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('grants nothing for three of four chapters', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const chapter of ['toronto', 'huron', 'simcoe'] as const) {
      await seedResult(IDS.rider, chapter, CURRENT_SEASON)
    }
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('grants the award as soon as the last pending result is marked finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids: string[] = []
    for (const chapter of REQUIRED) {
      ids.push(await seedResult(IDS.rider, chapter, CURRENT_SEASON, { status: 'pending' }))
    }
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)

    for (const id of ids.slice(0, 3)) {
      await checked(
        supabase.from('results').update({ status: 'finished' }).eq('id', id),
        'finish result'
      )
    }
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)

    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('id', ids[3]),
      'finish final result'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('is earned at most once per season, even with repeat rides in every chapter', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedAllFour(IDS.rider, CURRENT_SEASON)
    await seedAllFour(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not grant the award for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedAllFour(IDS.rider, PRIOR_SEASON)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('ignores non-brevet results (populaire, permanent, fleche)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 'toronto', CURRENT_SEASON)
    await seedResult(IDS.rider, 'huron', CURRENT_SEASON, { eventType: 'populaire' })
    await seedResult(IDS.rider, 'ottawa', CURRENT_SEASON, { eventType: 'permanent' })
    await seedResult(IDS.rider, 'simcoe', CURRENT_SEASON, { eventType: 'fleche', distance: 360 })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('ignores a brevet under 200 km (mistyped short event)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 'toronto', CURRENT_SEASON)
    await seedResult(IDS.rider, 'huron', CURRENT_SEASON)
    await seedResult(IDS.rider, 'ottawa', CURRENT_SEASON)
    await seedResult(IDS.rider, 'simcoe', CURRENT_SEASON, { distance: 106 })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('does not count a brevet in a non-active chapter toward the four', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 'toronto', CURRENT_SEASON)
    await seedResult(IDS.rider, 'huron', CURRENT_SEASON)
    await seedResult(IDS.rider, 'ottawa', CURRENT_SEASON)
    await seedResult(IDS.rider, 'niagara', CURRENT_SEASON)
    await seedResult(IDS.rider, 'other', CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('counts longer brevets too: a 1000 in Ottawa covers that chapter', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedResult(IDS.rider, 'toronto', CURRENT_SEASON, { distance: 300 })
    await seedResult(IDS.rider, 'huron', CURRENT_SEASON, { distance: 400 })
    await seedResult(IDS.rider, 'ottawa', CURRENT_SEASON, { distance: 1000 })
    await seedResult(IDS.rider, 'simcoe', CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('removes the award when a qualifying result flips to dnf', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids = await seedAllFour(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await checked(
      supabase.from('results').update({ status: 'dnf' }).eq('id', ids[2]),
      'flip Ottawa to dnf'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the award when a qualifying result is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids = await seedAllFour(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await checked(supabase.from('results').delete().eq('id', ids[3]), 'delete Simcoe')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('keeps the award when a redundant result is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedAllFour(IDS.rider, CURRENT_SEASON)
    const extraToronto = await seedResult(IDS.rider, 'toronto', CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await checked(supabase.from('results').delete().eq('id', extraToronto), 'delete extra')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('moves the award when a result is reassigned to another rider', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedRider(IDS.riderB, SLUGS.riderB)
    const ids = await seedAllFour(IDS.rider, CURRENT_SEASON)
    for (const chapter of ['toronto', 'huron', 'ottawa'] as const) {
      await seedResult(IDS.riderB, chapter, CURRENT_SEASON)
    }
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await autoCount(IDS.riderB, CURRENT_SEASON)).toBe(0)

    // The Simcoe result was really rider B's.
    await checked(
      supabase.from('results').update({ rider_id: IDS.riderB }).eq('id', ids[3]),
      'reassign Simcoe result'
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
    await seedAllFour(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })
})
