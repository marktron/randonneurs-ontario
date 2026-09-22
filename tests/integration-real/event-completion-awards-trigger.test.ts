import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

const supabase = getTestSupabase()

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000b1',
  route: '00000000-0000-4000-a000-0000000000b3',
}
const SLUGS = { rider: 'inttest-evc-rider-a' }

let pbpAwardId: string
let gaAwardId: string
let chapterIds: Record<string, string>
let eventSeq = 0

beforeAll(async () => {
  const awards = await checked(
    supabase.from('awards').select('id, slug').in('slug', ['paris-brest-paris', 'granite-anvil']),
    'load award ids'
  )
  const bySlug = Object.fromEntries(
    (awards as { id: string; slug: string }[]).map((a) => [a.slug, a.id])
  )
  pbpAwardId = bySlug['paris-brest-paris']
  gaAwardId = bySlug['granite-anvil']
  if (!pbpAwardId || !gaAwardId) throw new Error('[integration-real] award rows not seeded')

  const chapters = await checked(supabase.from('chapters').select('id, slug'), 'load chapters')
  chapterIds = Object.fromEntries(
    (chapters as { id: string; slug: string }[]).map((c) => [c.slug, c.id])
  )

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-evc-route',
      chapter_id: chapterIds.ottawa,
      name: 'IntTest Event Completion Route',
      distance_km: 1200,
      collection: null,
    }),
    'seed route'
  )
  await checked(
    supabase
      .from('riders')
      .upsert(
        { id: IDS.rider, slug: SLUGS.rider, first_name: 'IntTest', last_name: 'EVC' },
        { onConflict: 'id' }
      ),
    'seed rider'
  )
})

afterEach(async () => {
  // result_awards cascades from results.
  await supabase.from('results').delete().eq('rider_id', IDS.rider)
  await supabase.from('events').delete().eq('route_id', IDS.route)
})

afterAll(async () => {
  await supabase.from('results').delete().eq('rider_id', IDS.rider)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('riders').delete().eq('id', IDS.rider)
  await supabase.from('routes').delete().eq('id', IDS.route)
})

// Create a result on a brevet with the given collection tag and distance.
// Returns the result id so tests can update/delete it.
async function seedResult(opts: {
  collection: string | null
  distance: number
  season?: number
  status?: string
  chapter?: 'other' | 'ottawa' | 'simcoe'
}): Promise<string> {
  const season = opts.season ?? CURRENT_SEASON
  const status = opts.status ?? 'finished'
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-00000000c${String(eventSeq + 700).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000d${String(eventSeq + 700).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-evc-${eventSeq}`,
      name: `IntTest Event Completion ${eventSeq}`,
      chapter_id: chapterIds[opts.chapter ?? 'ottawa'],
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: opts.distance,
      collection: opts.collection,
      event_date: `${season}-08-20`,
      status: 'completed',
    }),
    `seed event ${eventSeq}`
  )
  await checked(
    supabase.from('results').insert({
      id: resultId,
      event_id: eventId,
      rider_id: IDS.rider,
      status,
      season,
      distance_km: opts.distance,
    }),
    `seed result ${eventSeq}`
  )
  return resultId
}

async function hasAward(resultId: string, awardId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('result_awards')
    .select('result_id', { count: 'exact', head: true })
    .eq('result_id', resultId)
    .eq('award_id', awardId)
  if (error) throw new Error(`hasAward: ${error.message}`)
  return (count ?? 0) > 0
}

describe('Event completion awards trigger (Paris-Brest-Paris, Granite Anvil)', () => {
  it('tags a finished result on a paris-brest-paris event', async () => {
    const id = await seedResult({
      collection: 'paris-brest-paris',
      distance: 1200,
      chapter: 'other',
    })
    expect(await hasAward(id, pbpAwardId)).toBe(true)
    expect(await hasAward(id, gaAwardId)).toBe(false)
  })

  it('tags a finished result on a granite-anvil 1200', async () => {
    const id = await seedResult({ collection: 'granite-anvil', distance: 1200 })
    expect(await hasAward(id, gaAwardId)).toBe(true)
    expect(await hasAward(id, pbpAwardId)).toBe(false)
  })

  it('tags a finished result on a granite-anvil 1300', async () => {
    const id = await seedResult({ collection: 'granite-anvil', distance: 1300, chapter: 'simcoe' })
    expect(await hasAward(id, gaAwardId)).toBe(true)
  })

  it('does not tag the granite-anvil 1000 edition', async () => {
    const id = await seedResult({ collection: 'granite-anvil', distance: 1000 })
    expect(await hasAward(id, gaAwardId)).toBe(false)
  })

  it('does not tag an untagged 1200 km brevet', async () => {
    const id = await seedResult({ collection: null, distance: 1200 })
    expect(await hasAward(id, gaAwardId)).toBe(false)
    expect(await hasAward(id, pbpAwardId)).toBe(false)
  })

  it('does not tag a pending or dnf result', async () => {
    const pending = await seedResult({
      collection: 'paris-brest-paris',
      distance: 1200,
      status: 'pending',
    })
    const dnf = await seedResult({ collection: 'granite-anvil', distance: 1200, status: 'dnf' })
    expect(await hasAward(pending, pbpAwardId)).toBe(false)
    expect(await hasAward(dnf, gaAwardId)).toBe(false)
  })

  it('tags the result when it is marked finished', async () => {
    const id = await seedResult({
      collection: 'paris-brest-paris',
      distance: 1200,
      status: 'pending',
    })
    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('id', id),
      'finish result'
    )
    expect(await hasAward(id, pbpAwardId)).toBe(true)
  })

  it('removes the badge when the result flips to dnf', async () => {
    const id = await seedResult({ collection: 'granite-anvil', distance: 1200 })
    expect(await hasAward(id, gaAwardId)).toBe(true)
    await checked(supabase.from('results').update({ status: 'dnf' }).eq('id', id), 'flip to dnf')
    expect(await hasAward(id, gaAwardId)).toBe(false)
  })

  it('does not touch a prior (closed) season', async () => {
    const id = await seedResult({
      collection: 'paris-brest-paris',
      distance: 1200,
      season: PRIOR_SEASON,
    })
    expect(await hasAward(id, pbpAwardId)).toBe(false)
  })

  it('leaves a hand-assigned badge on an untagged event alone', async () => {
    const id = await seedResult({ collection: null, distance: 1200 })
    await checked(
      supabase.from('result_awards').insert({ result_id: id, award_id: pbpAwardId }),
      'hand-assign PBP'
    )
    // Any results change re-runs the reconciler; the manual row must survive.
    await checked(supabase.from('results').update({ status: 'dnf' }).eq('id', id), 'flip to dnf')
    expect(await hasAward(id, pbpAwardId)).toBe(true)
  })
})
