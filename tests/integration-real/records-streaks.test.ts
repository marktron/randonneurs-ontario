import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// Covers the "2020 bridge year" logic in both streak RPCs:
// a missing 2020 does not break a rider's streak, but it also doesn't
// add to the streak length unless they actually qualified that year.

const TEST_CURRENT_SEASON = 2026

// Deterministic UUIDs keep cleanup reliable across reruns.
const IDS = {
  route: '00000000-57ea-4000-a000-000000000000',
  riderA: '00000000-57ea-4000-a000-0000000000aa',
  riderB: '00000000-57ea-4000-a000-0000000000bb',
  riderC: '00000000-57ea-4000-a000-0000000000cc',
  riderPre: '00000000-57ea-4000-a000-0000000000dd',
  eventPrefix: '00000000-57ea-4000-a000-0000ffff00', // suffix with 2-digit year offset
}

const SLUGS = {
  riderA: 'inttest-streak-rider-a',
  riderB: 'inttest-streak-rider-b',
  riderC: 'inttest-streak-rider-c',
  riderPre: 'inttest-streak-rider-pre',
}

// Build a deterministic event UUID per season (2018..2025 → offset 00..07)
function eventIdForSeason(season: number): string {
  const offset = (season - 2018).toString(16).padStart(2, '0')
  return `${IDS.eventPrefix}${offset}`
}

const ALL_SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

// Qualifying pattern per rider — matches the user's examples.
const RIDER_SEASONS: Record<string, number[]> = {
  [IDS.riderA]: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  [IDS.riderB]: [2018, 2019, 2021, 2022, 2023, 2024, 2025],
  [IDS.riderC]: [2018, 2019, 2021, 2022, 2023, 2025],
  [IDS.riderPre]: [2018, 2019],
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const riderIds = [IDS.riderA, IDS.riderB, IDS.riderC, IDS.riderPre]
  const eventIds = ALL_SEASONS.map(eventIdForSeason)
  await supabase.from('rider_awards').delete().in('rider_id', riderIds)
  await supabase.from('results').delete().in('rider_id', riderIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('riders').delete().in('id', riderIds)
}

describe('streak RPCs — 2020 bridge year (real DB)', () => {
  const supabase = getTestSupabase()
  let superRandonneurAwardId: string

  beforeAll(async () => {
    const { data: award, error } = await supabase
      .from('awards')
      .select('id')
      .eq('slug', 'super-randonneur')
      .single()
    if (error || !award) throw new Error('super-randonneur award not found — seed your DB')
    superRandonneurAwardId = award.id

    await cleanup(supabase)

    // Riders
    await checked(
      supabase.from('riders').insert([
        { id: IDS.riderA, slug: SLUGS.riderA, first_name: 'InttestStreak', last_name: 'RiderA' },
        { id: IDS.riderB, slug: SLUGS.riderB, first_name: 'InttestStreak', last_name: 'RiderB' },
        { id: IDS.riderC, slug: SLUGS.riderC, first_name: 'InttestStreak', last_name: 'RiderC' },
        {
          id: IDS.riderPre,
          slug: SLUGS.riderPre,
          first_name: 'InttestStreak',
          last_name: 'RiderPre',
        },
      ]),
      'seed streak test riders'
    )

    // Shared route + one event per season. event_date just needs to be unique and valid.
    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-streak-route',
        name: 'IntTest Streak Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed streak test route'
    )

    await checked(
      supabase.from('events').insert(
        ALL_SEASONS.map((season) => ({
          id: eventIdForSeason(season),
          slug: `inttest-streak-${season}`,
          name: `IntTest Streak ${season}`,
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: `${season}-06-15`,
          status: 'completed',
        }))
      ),
      'seed streak test events'
    )

    // Finished results per rider per qualifying season
    const resultRows = Object.entries(RIDER_SEASONS).flatMap(([riderId, seasons]) =>
      seasons.map((season) => ({
        event_id: eventIdForSeason(season),
        rider_id: riderId,
        status: 'finished',
        season,
        distance_km: 200,
      }))
    )
    await checked(supabase.from('results').insert(resultRows), 'seed streak test results')

    // Mirror the same season patterns for SR awards so the SR streak test has fixtures too
    const awardRows = Object.entries(RIDER_SEASONS).flatMap(([riderId, seasons]) =>
      seasons.map((season) => ({
        rider_id: riderId,
        award_id: superRandonneurAwardId,
        season,
      }))
    )
    await checked(supabase.from('rider_awards').insert(awardRows), 'seed streak test SR awards')
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  async function findLongestStreak(slug: string) {
    const { data, error } = await supabase.rpc('get_rider_longest_streaks', {
      p_current_season: TEST_CURRENT_SEASON,
      limit_count: 10000,
    })
    if (error) throw error
    return data!.find((r: { rider_slug: string }) => r.rider_slug === slug)
  }

  async function findSrStreak(slug: string) {
    const { data, error } = await supabase.rpc('get_rider_sr_streaks', {
      p_current_season: TEST_CURRENT_SEASON,
      limit_count: 10000,
    })
    if (error) throw error
    return data!.find((r: { rider_slug: string }) => r.rider_slug === slug)
  }

  describe('get_rider_longest_streaks', () => {
    it('unbroken streak through 2020 — length 8', async () => {
      const row = await findLongestStreak(SLUGS.riderA)
      expect(row?.streak_length).toBe(8)
      expect(row?.streak_end_season).toBe(2025)
    })

    it('missed 2020 only — bridged to length 7, start 2018', async () => {
      const row = await findLongestStreak(SLUGS.riderB)
      expect(row?.streak_length).toBe(7)
      expect(row?.streak_start_season).toBe(2018)
      expect(row?.streak_end_season).toBe(2025)
    })

    it('missed 2020 and 2024 — current streak is only 2025', async () => {
      const row = await findLongestStreak(SLUGS.riderC)
      expect(row?.streak_length).toBe(1)
      expect(row?.streak_end_season).toBe(2025)
    })

    it('pre-2020 only activity — excluded by active filter, no synthetic-only row leaks', async () => {
      const row = await findLongestStreak(SLUGS.riderPre)
      expect(row).toBeUndefined()
    })
  })

  describe('get_rider_sr_streaks', () => {
    it('unbroken SR streak through 2020 — length 8', async () => {
      const row = await findSrStreak(SLUGS.riderA)
      expect(row?.streak_length).toBe(8)
      expect(row?.streak_end_season).toBe(2025)
    })

    it('missed SR in 2020 only — bridged to length 7', async () => {
      const row = await findSrStreak(SLUGS.riderB)
      expect(row?.streak_length).toBe(7)
      expect(row?.streak_end_season).toBe(2025)
    })

    it('missed SR in 2020 and 2024 — longest historical run is 2018-2023 = 5', async () => {
      // SR streaks have no active-season filter, so Rider C's historical 5-season run
      // (2018,2019,[bridged 2020],2021,2022,2023) wins over the single 2025.
      const row = await findSrStreak(SLUGS.riderC)
      expect(row?.streak_length).toBe(5)
      expect(row?.streak_start_season).toBe(2018)
      expect(row?.streak_end_season).toBe(2023)
    })

    it('pre-2020 SR only — streak length 2, not inflated by synthetic 2020', async () => {
      const row = await findSrStreak(SLUGS.riderPre)
      expect(row?.streak_length).toBe(2)
      expect(row?.streak_end_season).toBe(2019)
    })
  })
})
