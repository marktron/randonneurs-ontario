import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

const supabase = getTestSupabase()

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

type ChapterSlug = 'toronto' | 'huron' | 'ottawa' | 'simcoe' | 'niagara' | 'other' | 'permanent'

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000d1',
  riderB: '00000000-0000-4000-a000-0000000000d2',
  route: '00000000-0000-4000-a000-0000000000d3',
}
const SLUGS = {
  rider: 'inttest-o5k-rider-a',
  riderB: 'inttest-o5k-rider-b',
}
const ALL_RIDER_IDS = [IDS.rider, IDS.riderB]

let awardId: string
let chapterIds: Record<string, string>
let eventSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'o-5000').single(),
    'load O-5000 award id'
  )
  awardId = (award as { id: string }).id

  const chapters = await checked(supabase.from('chapters').select('id, slug'), 'load chapters')
  chapterIds = Object.fromEntries(
    (chapters as { id: string; slug: string }[]).map((c) => [c.slug, c.id])
  )
  for (const slug of ['toronto', 'other', 'permanent'] as const) {
    if (!chapterIds[slug]) throw new Error(`[integration-real] chapter ${slug} not seeded`)
  }

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-o5k-route',
      chapter_id: chapterIds.toronto,
      name: 'IntTest O5K Route',
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
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'O5K' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// Create a finished result of `distance` km for `rider` in `season`.
// Returns the result id so tests can update/delete it.
async function seedResult(
  riderId: string,
  distance: number,
  season: number,
  opts: { status?: string; eventType?: string; chapter?: ChapterSlug } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const eventType = opts.eventType ?? 'brevet'
  const chapter = opts.chapter ?? 'toronto'
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-00000000a${String(eventSeq).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000b${String(eventSeq).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-o5k-${eventSeq}`,
      name: `IntTest O5K Event ${eventSeq}`,
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

// Seeds 4800 km of unambiguously qualifying rides (8 x 600 brevets in Toronto).
async function seedBase4800(riderId: string, season: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < 8; i++) ids.push(await seedResult(riderId, 600, season))
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

async function seasonDistanceShown(riderSlug: string, season: number): Promise<number | null> {
  const rows = await checked(
    supabase.rpc('get_award_recipients_with_distance', { p_award_slug: 'o-5000' }),
    'get_award_recipients_with_distance'
  )
  const row = (rows as { rider_slug: string; award_year: number; season_distance: number }[]).find(
    (r) => r.rider_slug === riderSlug && r.award_year === season
  )
  return row ? Number(row.season_distance) : null
}

describe('O-5000 auto-assignment trigger', () => {
  it('grants the award at exactly 5000 km of finished results', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('grants nothing at 4999 km', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 199, CURRENT_SEASON, { eventType: 'populaire' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('counts populaires, permanents and flèches toward the total', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 60, CURRENT_SEASON, { eventType: 'populaire' })
    await seedResult(IDS.rider, 100, CURRENT_SEASON, {
      eventType: 'permanent',
      chapter: 'permanent',
    })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await seedResult(IDS.rider, 40, CURRENT_SEASON, { eventType: 'fleche' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('counts the club Flèche even though it is filed under the "other" chapter', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 380, CURRENT_SEASON, { eventType: 'fleche', chapter: 'other' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not count a brevet under the "other" chapter (e.g. Paris-Brest-Paris)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 1200, CURRENT_SEASON, { chapter: 'other' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('counts brevets under the inactive Niagara chapter', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 200, CURRENT_SEASON, { chapter: 'niagara' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('ignores dnf and pending results', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { status: 'dnf' })
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { status: 'pending' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('grants the award when the pending result that crosses 5000 is marked finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    const id = await seedResult(IDS.rider, 300, CURRENT_SEASON, { status: 'pending' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('id', id),
      'finish result'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('is earned at most once per season, even past 10000 km', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 600, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not grant the award for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, PRIOR_SEASON)
    await seedResult(IDS.rider, 600, PRIOR_SEASON)
    expect(await autoCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('removes the award when a result that carried it over 5000 flips to dnf', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    const id = await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    await checked(supabase.from('results').update({ status: 'dnf' }).eq('id', id), 'flip to dnf')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('removes the award when a result is deleted', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const ids = await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    await checked(supabase.from('results').delete().eq('id', ids[0]), 'delete a 600')
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })

  it('re-evaluates when a result distance is corrected', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    const id = await seedResult(IDS.rider, 100, CURRENT_SEASON, { eventType: 'populaire' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    await checked(
      supabase.from('results').update({ distance_km: 200 }).eq('id', id),
      'correct distance'
    )
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('moves the award when a result is reassigned to another rider', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedRider(IDS.riderB, SLUGS.riderB)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    const id = await seedResult(IDS.rider, 600, CURRENT_SEASON)
    await seedBase4800(IDS.riderB, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await autoCount(IDS.riderB, CURRENT_SEASON)).toBe(0)

    await checked(
      supabase.from('results').update({ rider_id: IDS.riderB }).eq('id', id),
      'reassign result'
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
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 200, CURRENT_SEASON)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)

    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(0)
    expect(await manualCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })
})

describe('get_award_recipients_with_distance season total', () => {
  it('matches the qualifying total: excludes "other" brevets, keeps the "other" Flèche', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    await seedBase4800(IDS.rider, CURRENT_SEASON)
    await seedResult(IDS.rider, 380, CURRENT_SEASON, { eventType: 'fleche', chapter: 'other' })
    await seedResult(IDS.rider, 1200, CURRENT_SEASON, { chapter: 'other' })
    await seedResult(IDS.rider, 600, CURRENT_SEASON, { status: 'dnf' })
    expect(await autoCount(IDS.rider, CURRENT_SEASON)).toBe(1)
    expect(await seasonDistanceShown(SLUGS.rider, CURRENT_SEASON)).toBe(4800 + 380)
  })
})
