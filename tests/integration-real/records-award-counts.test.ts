import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

// Riders can earn multiple Super Randonneur awards in a single season.
// get_rider_award_counts must count rows in rider_awards, not distinct seasons.

const IDS = {
  riderMulti: '00000000-acc0-4000-a000-0000000000a1',
  riderSingle: '00000000-acc0-4000-a000-0000000000a2',
}

const SLUGS = {
  riderMulti: 'inttest-award-count-multi',
  riderSingle: 'inttest-award-count-single',
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const riderIds = [IDS.riderMulti, IDS.riderSingle]
  await supabase.from('rider_awards').delete().in('rider_id', riderIds)
  await supabase.from('riders').delete().in('id', riderIds)
}

describe('get_rider_award_counts — multiple awards per season (real DB)', () => {
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

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderMulti,
          slug: SLUGS.riderMulti,
          first_name: 'InttestAwardCount',
          last_name: 'Multi',
        },
        {
          id: IDS.riderSingle,
          slug: SLUGS.riderSingle,
          first_name: 'InttestAwardCount',
          last_name: 'Single',
        },
      ]),
      'seed award-count test riders'
    )

    // Multi rider: 3 SR awards in 2024, 2 SR awards in 2025 → 5 total awards
    // Single rider: 1 SR award per season across 2022-2025 → 4 total awards
    await checked(
      supabase.from('rider_awards').insert([
        { rider_id: IDS.riderMulti, award_id: superRandonneurAwardId, season: 2024 },
        { rider_id: IDS.riderMulti, award_id: superRandonneurAwardId, season: 2024 },
        { rider_id: IDS.riderMulti, award_id: superRandonneurAwardId, season: 2024 },
        { rider_id: IDS.riderMulti, award_id: superRandonneurAwardId, season: 2025 },
        { rider_id: IDS.riderMulti, award_id: superRandonneurAwardId, season: 2025 },
        { rider_id: IDS.riderSingle, award_id: superRandonneurAwardId, season: 2022 },
        { rider_id: IDS.riderSingle, award_id: superRandonneurAwardId, season: 2023 },
        { rider_id: IDS.riderSingle, award_id: superRandonneurAwardId, season: 2024 },
        { rider_id: IDS.riderSingle, award_id: superRandonneurAwardId, season: 2025 },
      ]),
      'seed award-count test rider_awards'
    )
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  async function findCount(slug: string) {
    const { data, error } = await supabase.rpc('get_rider_award_counts', {
      p_award_slug: 'super-randonneur',
      limit_count: 10000,
    })
    if (error) throw error
    return data!.find((r: { rider_slug: string }) => r.rider_slug === slug)
  }

  it('counts every SR row for a rider, including multiple awards in the same season', async () => {
    const row = await findCount(SLUGS.riderMulti)
    expect(row?.value).toBe(5)
  })

  it('counts one row per season when a rider earns one SR per season', async () => {
    const row = await findCount(SLUGS.riderSingle)
    expect(row?.value).toBe(4)
  })
})
