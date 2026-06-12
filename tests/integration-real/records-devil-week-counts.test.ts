import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// "Most Completed Devil Weeks" must count completed series, not rides.
// The completed-devil-week award is result-scoped, so a finished series tags
// each of its four rides (200/300/400/600) with a result_awards row. There is
// exactly one Devil Week per calendar year, so the series count is the number
// of distinct event years carrying the award — robust even when a year is only
// partially tagged (3 of 4 rides).

const DISTANCES = [200, 300, 400, 600] as const
const YEARS = [2022, 2023, 2024] as const

// Deterministic UUIDs keep cleanup reliable across reruns.
const IDS = {
  route: '00000000-de71-4000-a000-000000000000',
  riderTwoSeries: '00000000-de71-4000-a000-0000000000a1',
  riderOneSeries: '00000000-de71-4000-a000-0000000000a2',
  riderPartialYear: '00000000-de71-4000-a000-0000000000a3',
}

const SLUGS = {
  riderTwoSeries: 'inttest-devil-week-two-series',
  riderOneSeries: 'inttest-devil-week-one-series',
  riderPartialYear: 'inttest-devil-week-partial-year',
}

// Event per (year, distance): suffix encodes year offset + distance index.
function eventId(year: number, distance: number): string {
  const yearOffset = (year - YEARS[0]).toString(16).padStart(2, '0')
  const distanceIndex = DISTANCES.indexOf(distance as (typeof DISTANCES)[number])
  return `00000000-de71-4000-a000-0000eeee${yearOffset}0${distanceIndex}`
}

// Result per (rider suffix, year, distance)
function resultId(riderSuffix: string, year: number, distance: number): string {
  const yearOffset = (year - YEARS[0]).toString(16).padStart(2, '0')
  const distanceIndex = DISTANCES.indexOf(distance as (typeof DISTANCES)[number])
  return `00000000-de71-4000-a000-0000${riderSuffix}${yearOffset}0${distanceIndex}`
}

// (rider, year, distances) fixtures:
// two-series rider: full 2023 + full 2024 series → 2 completed Devil Weeks
// one-series rider: full 2024 series → 1
// partial-year rider: only 3 of 4 rides tagged in 2022 → still 1 series, never 0.75 or 3
const FIXTURES: Array<{
  riderId: string
  riderSuffix: string
  rides: Array<{ year: number; distance: number }>
}> = [
  {
    riderId: IDS.riderTwoSeries,
    riderSuffix: 'aaa1',
    rides: [2023, 2024].flatMap((year) => DISTANCES.map((distance) => ({ year, distance }))),
  },
  {
    riderId: IDS.riderOneSeries,
    riderSuffix: 'aaa2',
    rides: DISTANCES.map((distance) => ({ year: 2024, distance })),
  },
  {
    riderId: IDS.riderPartialYear,
    riderSuffix: 'aaa3',
    rides: [200, 300, 400].map((distance) => ({ year: 2022, distance })),
  },
]

const ALL_EVENT_IDS = YEARS.flatMap((year) => DISTANCES.map((distance) => eventId(year, distance)))
const ALL_RESULT_IDS = FIXTURES.flatMap(({ riderSuffix, rides }) =>
  rides.map(({ year, distance }) => resultId(riderSuffix, year, distance))
)

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const riderIds = [IDS.riderTwoSeries, IDS.riderOneSeries, IDS.riderPartialYear]
  await supabase.from('result_awards').delete().in('result_id', ALL_RESULT_IDS)
  await supabase.from('results').delete().in('rider_id', riderIds)
  await supabase.from('events').delete().in('id', ALL_EVENT_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('riders').delete().in('id', riderIds)
}

describe('get_rider_devil_week_counts — series, not rides (real DB)', () => {
  const supabase = getTestSupabase()

  beforeAll(async () => {
    const { data: award, error } = await supabase
      .from('awards')
      .select('id')
      .eq('slug', 'completed-devil-week')
      .single()
    if (error || !award) throw new Error('completed-devil-week award not found — seed your DB')
    const devilWeekAwardId = award.id

    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderTwoSeries,
          slug: SLUGS.riderTwoSeries,
          first_name: 'InttestDevilWeek',
          last_name: 'TwoSeries',
        },
        {
          id: IDS.riderOneSeries,
          slug: SLUGS.riderOneSeries,
          first_name: 'InttestDevilWeek',
          last_name: 'OneSeries',
        },
        {
          id: IDS.riderPartialYear,
          slug: SLUGS.riderPartialYear,
          first_name: 'InttestDevilWeek',
          last_name: 'PartialYear',
        },
      ]),
      'seed devil week test riders'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-devil-week-route',
        name: 'IntTest Devil Week Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed devil week test route'
    )

    await checked(
      supabase.from('events').insert(
        YEARS.flatMap((year) =>
          DISTANCES.map((distance) => ({
            id: eventId(year, distance),
            slug: `inttest-devil-week-${year}-${distance}`,
            name: `IntTest Devil Week ${year} ${distance}`,
            chapter_id: TORONTO_CHAPTER_ID,
            route_id: IDS.route,
            event_type: 'brevet',
            distance_km: distance,
            event_date: `${year}-06-15`,
            status: 'completed',
          }))
        )
      ),
      'seed devil week test events'
    )

    await checked(
      supabase.from('results').insert(
        FIXTURES.flatMap(({ riderId, riderSuffix, rides }) =>
          rides.map(({ year, distance }) => ({
            id: resultId(riderSuffix, year, distance),
            event_id: eventId(year, distance),
            rider_id: riderId,
            status: 'finished',
            season: year,
            distance_km: distance,
          }))
        )
      ),
      'seed devil week test results'
    )

    await checked(
      supabase.from('result_awards').insert(
        FIXTURES.flatMap(({ riderSuffix, rides }) =>
          rides.map(({ year, distance }) => ({
            result_id: resultId(riderSuffix, year, distance),
            award_id: devilWeekAwardId,
          }))
        )
      ),
      'seed devil week test result awards'
    )
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  async function findCount(slug: string) {
    const { data, error } = await supabase.rpc('get_rider_devil_week_counts', {
      limit_count: 10000,
    })
    if (error) throw error
    return data!.find((r: { rider_slug: string }) => r.rider_slug === slug)
  }

  it('counts two completed series as 2, not 8 rides', async () => {
    const row = await findCount(SLUGS.riderTwoSeries)
    expect(row?.value).toBe(2)
  })

  it('counts one completed series as 1, not 4 rides', async () => {
    const row = await findCount(SLUGS.riderOneSeries)
    expect(row?.value).toBe(1)
  })

  it('counts a partially-tagged year as 1 series', async () => {
    const row = await findCount(SLUGS.riderPartialYear)
    expect(row?.value).toBe(1)
  })
})
