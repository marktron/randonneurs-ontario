import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// Covers rider_number assignment from rider_number_seq:
//   - dns results never assign a number
//   - a non-dns result assigns a number above every existing number
//   - later results do not change the number
//   - deleting the highest-numbered rider never lets its number be reused

const IDS = {
  route: '00000000-5e01-4000-a000-000000000000',
  event: '00000000-5e01-4000-a000-0000ffff0001',
  riderDns: '00000000-5e01-4000-a000-0000000000a1',
  riderDnf: '00000000-5e01-4000-a000-0000000000a2',
  riderHigh: '00000000-5e01-4000-a000-0000000000a3',
  riderAfter: '00000000-5e01-4000-a000-0000000000a4',
}

const SLUGS = {
  route: 'inttest-rider-number-route',
  event: 'inttest-rider-number-event',
  riderDns: 'inttest-rider-number-dns',
  riderDnf: 'inttest-rider-number-dnf',
  riderHigh: 'inttest-rider-number-high',
  riderAfter: 'inttest-rider-number-after',
}

const ALL_RIDER_IDS = [IDS.riderDns, IDS.riderDnf, IDS.riderHigh, IDS.riderAfter]
const ALL_RIDER_SLUGS = [SLUGS.riderDns, SLUGS.riderDnf, SLUGS.riderHigh, SLUGS.riderAfter]

type Client = ReturnType<typeof getTestSupabase>

async function cleanupRiders(supabase: Client) {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('riders').delete().in('slug', ALL_RIDER_SLUGS)
}

async function fullCleanup(supabase: Client) {
  await cleanupRiders(supabase)
  await supabase.from('events').delete().eq('id', IDS.event)
  await supabase.from('events').delete().eq('slug', SLUGS.event)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('routes').delete().eq('slug', SLUGS.route)
}

describe('rider number sequence (real DB)', () => {
  const supabase = getTestSupabase()

  async function createRider(id: string, slug: string, last: string) {
    await checked(
      supabase.from('riders').insert({ id, slug, first_name: 'IntRN', last_name: last }),
      `insert rider ${slug}`
    )
  }

  async function addResult(riderId: string, status: string) {
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: riderId,
        status,
        season: 2024,
        distance_km: 200,
      }),
      `insert ${status} result`
    )
  }

  async function riderNumber(id: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('riders')
      .select('rider_number')
      .eq('id', id)
      .single()
    if (error) throw error
    return data.rider_number
  }

  async function maxNumber(): Promise<number> {
    const { data, error } = await supabase
      .from('riders')
      .select('rider_number')
      .not('rider_number', 'is', null)
      .order('rider_number', { ascending: false })
      .limit(1)
    if (error) throw error
    return data?.[0]?.rider_number ?? 0
  }

  beforeAll(async () => {
    await fullCleanup(supabase)

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: SLUGS.route,
        name: 'IntTest Rider Number Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed rider-number route'
    )
    await checked(
      supabase.from('events').insert({
        id: IDS.event,
        slug: SLUGS.event,
        name: 'IntTest Rider Number Event',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: '2024-06-15',
        status: 'completed',
      }),
      'seed rider-number event'
    )
  })

  afterEach(async () => {
    await cleanupRiders(supabase)
  })

  afterAll(async () => {
    await fullCleanup(supabase)
  })

  it('does not assign a number for a dns result', async () => {
    await createRider(IDS.riderDns, SLUGS.riderDns, 'Dns')
    await addResult(IDS.riderDns, 'dns')

    expect(await riderNumber(IDS.riderDns)).toBeNull()
  })

  it('assigns a number above every existing number on a non-dns result', async () => {
    await createRider(IDS.riderDnf, SLUGS.riderDnf, 'Dnf')
    const before = await maxNumber()

    await addResult(IDS.riderDnf, 'dnf')

    const assigned = await riderNumber(IDS.riderDnf)
    expect(assigned).not.toBeNull()
    expect(assigned!).toBeGreaterThan(before)
  })

  it('does not change the number on a second result', async () => {
    await createRider(IDS.riderDnf, SLUGS.riderDnf, 'Dnf')
    await addResult(IDS.riderDnf, 'dnf')
    const first = await riderNumber(IDS.riderDnf)

    // A different event is needed for a second row if (event, rider) is unique,
    // so update the status instead, which also fires the trigger.
    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('rider_id', IDS.riderDnf),
      'update result status'
    )

    expect(first).not.toBeNull()
    expect(await riderNumber(IDS.riderDnf)).toBe(first)
  })

  it('never reuses the number of a deleted highest-numbered rider', async () => {
    await createRider(IDS.riderHigh, SLUGS.riderHigh, 'High')
    await addResult(IDS.riderHigh, 'dnf')
    const retired = await riderNumber(IDS.riderHigh)
    expect(retired).not.toBeNull()
    expect(retired!).toBe(await maxNumber())

    await supabase.from('results').delete().eq('rider_id', IDS.riderHigh)
    await checked(supabase.from('riders').delete().eq('id', IDS.riderHigh), 'delete high rider')

    await createRider(IDS.riderAfter, SLUGS.riderAfter, 'After')
    await addResult(IDS.riderAfter, 'dnf')

    const next = await riderNumber(IDS.riderAfter)
    expect(next).not.toBeNull()
    expect(next!).toBeGreaterThan(retired!)
  })
})
