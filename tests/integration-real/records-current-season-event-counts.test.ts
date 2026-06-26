import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// "Most Events in <season>" ranks riders by the number of finished events in a
// single season. The RPC must:
//   - count one row per finished result (COUNT(*)), not distance
//   - filter strictly to the requested season (prior-season rides don't leak in)
//   - exclude non-finished results (DNF/DNS)

const SEASON = 2099 // far-future season keeps fixtures isolated from real data
const PRIOR_SEASON = 2098

const IDS = {
  route: '00000000-ce71-4000-a000-000000000000',
  riderThree: '00000000-ce71-4000-a000-0000000000b1',
  riderOne: '00000000-ce71-4000-a000-0000000000b2',
  riderDnf: '00000000-ce71-4000-a000-0000000000b3',
}

const SLUGS = {
  riderThree: 'inttest-current-events-three',
  riderOne: 'inttest-current-events-one',
  riderDnf: 'inttest-current-events-dnf',
}

// Six events: 4 in SEASON, 2 in PRIOR_SEASON. Distance varies so a distance-based
// ranking would order differently than a count-based one.
const EVENTS = [
  { id: '00000000-ce71-4000-a000-0000eeee0001', season: SEASON, distance: 200 },
  { id: '00000000-ce71-4000-a000-0000eeee0002', season: SEASON, distance: 300 },
  { id: '00000000-ce71-4000-a000-0000eeee0003', season: SEASON, distance: 400 },
  { id: '00000000-ce71-4000-a000-0000eeee0004', season: SEASON, distance: 600 },
  { id: '00000000-ce71-4000-a000-0000eeee0005', season: PRIOR_SEASON, distance: 200 },
  { id: '00000000-ce71-4000-a000-0000eeee0006', season: PRIOR_SEASON, distance: 1000 },
] as const

// Results: riderThree finishes 3 events in SEASON; riderOne finishes 1 in SEASON
// plus 2 in PRIOR_SEASON (must not count); riderDnf has a DNF in SEASON (no count).
const RESULTS = [
  // riderThree — 3 finished in SEASON
  {
    id: '00000000-ce71-4000-a000-0000bbb10001',
    rider: IDS.riderThree,
    event: EVENTS[0],
    status: 'finished',
  },
  {
    id: '00000000-ce71-4000-a000-0000bbb10002',
    rider: IDS.riderThree,
    event: EVENTS[1],
    status: 'finished',
  },
  {
    id: '00000000-ce71-4000-a000-0000bbb10003',
    rider: IDS.riderThree,
    event: EVENTS[2],
    status: 'finished',
  },
  // riderOne — 1 finished in SEASON + 2 finished in PRIOR_SEASON
  {
    id: '00000000-ce71-4000-a000-0000bbb20001',
    rider: IDS.riderOne,
    event: EVENTS[3],
    status: 'finished',
  },
  {
    id: '00000000-ce71-4000-a000-0000bbb20002',
    rider: IDS.riderOne,
    event: EVENTS[4],
    status: 'finished',
  },
  {
    id: '00000000-ce71-4000-a000-0000bbb20003',
    rider: IDS.riderOne,
    event: EVENTS[5],
    status: 'finished',
  },
  // riderDnf — a DNF in SEASON (must not be counted)
  {
    id: '00000000-ce71-4000-a000-0000bbb30001',
    rider: IDS.riderDnf,
    event: EVENTS[0],
    status: 'dnf',
  },
] as const

const ALL_EVENT_IDS = EVENTS.map((e) => e.id)
const ALL_RIDER_IDS = [IDS.riderThree, IDS.riderOne, IDS.riderDnf]
const ALL_RESULT_IDS = RESULTS.map((r) => r.id)

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('results').delete().in('id', ALL_RESULT_IDS)
  await supabase.from('events').delete().in('id', ALL_EVENT_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
}

describe('get_current_season_event_counts — counts finished events per season (real DB)', () => {
  const supabase = getTestSupabase()

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderThree,
          slug: SLUGS.riderThree,
          first_name: 'InttestEvents',
          last_name: 'Three',
        },
        { id: IDS.riderOne, slug: SLUGS.riderOne, first_name: 'InttestEvents', last_name: 'One' },
        { id: IDS.riderDnf, slug: SLUGS.riderDnf, first_name: 'InttestEvents', last_name: 'Dnf' },
      ]),
      'seed current-season-events test riders'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-current-events-route',
        name: 'IntTest Current Events Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed current-season-events test route'
    )

    await checked(
      supabase.from('events').insert(
        EVENTS.map((e) => ({
          id: e.id,
          slug: `inttest-current-events-${e.id.slice(-4)}`,
          name: `IntTest Current Events ${e.id.slice(-4)}`,
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: e.distance,
          event_date: `${e.season}-06-15`,
          status: 'completed',
        }))
      ),
      'seed current-season-events test events'
    )

    await checked(
      supabase.from('results').insert(
        RESULTS.map((r) => ({
          id: r.id,
          event_id: r.event.id,
          rider_id: r.rider,
          status: r.status,
          season: r.event.season,
          distance_km: r.event.distance,
        }))
      ),
      'seed current-season-events test results'
    )
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  async function rowFor(slug: string) {
    const { data, error } = await supabase.rpc('get_current_season_event_counts', {
      p_season: SEASON,
      limit_count: 10000,
    })
    if (error) throw error
    return data!.find((r: { rider_slug: string }) => r.rider_slug === slug)
  }

  it('counts each finished event in the season (3, not summed distance)', async () => {
    const row = await rowFor(SLUGS.riderThree)
    expect(row?.value).toBe(3)
  })

  it('counts only the requested season, ignoring prior-season finishes', async () => {
    const row = await rowFor(SLUGS.riderOne)
    expect(row?.value).toBe(1)
  })

  it('excludes non-finished results', async () => {
    const row = await rowFor(SLUGS.riderDnf)
    expect(row).toBeUndefined()
  })

  it('ranks the rider with more events ahead of the rider with fewer', async () => {
    const { data, error } = await supabase.rpc('get_current_season_event_counts', {
      p_season: SEASON,
      limit_count: 10000,
    })
    if (error) throw error
    const three = data!.find((r: { rider_slug: string }) => r.rider_slug === SLUGS.riderThree)
    const one = data!.find((r: { rider_slug: string }) => r.rider_slug === SLUGS.riderOne)
    expect(three!.rank).toBeLessThan(one!.rank)
  })
})
