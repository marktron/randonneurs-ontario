import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// Covers rider_number revocation (trg_revoke_rider_number) and the widened
// assign trigger (status or rider_id updates):
//   - flipping / deleting a rider's only qualifying result clears the number
//   - another qualifying result keeps the number
//   - moving a result to a numberless rider assigns, and revokes the old rider
//   - re-qualifying after revocation draws a fresh, higher number

const IDS = {
  route: '00000000-5e02-4000-a000-000000000000',
  event1: '00000000-5e02-4000-a000-0000ffff0001',
  event2: '00000000-5e02-4000-a000-0000ffff0002',
  riderA: '00000000-5e02-4000-a000-0000000000a1',
  riderB: '00000000-5e02-4000-a000-0000000000a2',
}

const SLUGS = {
  route: 'inttest-rider-revoke-route',
  event1: 'inttest-rider-revoke-event-1',
  event2: 'inttest-rider-revoke-event-2',
  riderA: 'inttest-rider-revoke-a',
  riderB: 'inttest-rider-revoke-b',
}

const ALL_RIDER_IDS = [IDS.riderA, IDS.riderB]
const ALL_RIDER_SLUGS = [SLUGS.riderA, SLUGS.riderB]
const ALL_EVENT_IDS = [IDS.event1, IDS.event2]
const ALL_EVENT_SLUGS = [SLUGS.event1, SLUGS.event2]

type Client = ReturnType<typeof getTestSupabase>

async function cleanupRiders(supabase: Client) {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('riders').delete().in('slug', ALL_RIDER_SLUGS)
}

async function fullCleanup(supabase: Client) {
  await cleanupRiders(supabase)
  await supabase.from('events').delete().in('id', ALL_EVENT_IDS)
  await supabase.from('events').delete().in('slug', ALL_EVENT_SLUGS)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('routes').delete().eq('slug', SLUGS.route)
}

describe('rider number revocation (real DB)', () => {
  const supabase = getTestSupabase()

  async function createRider(id: string, slug: string, last: string) {
    await checked(
      supabase.from('riders').insert({ id, slug, first_name: 'IntRV', last_name: last }),
      `insert rider ${slug}`
    )
  }

  async function addResult(riderId: string, eventId: string, status: string) {
    await checked(
      supabase.from('results').insert({
        event_id: eventId,
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

  beforeAll(async () => {
    await fullCleanup(supabase)
    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: SLUGS.route,
        name: 'IntTest Rider Revoke Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed revoke route'
    )
    for (const [i, key] of (['event1', 'event2'] as const).entries()) {
      await checked(
        supabase.from('events').insert({
          id: IDS[key],
          slug: SLUGS[key],
          name: `IntTest Rider Revoke Event ${i + 1}`,
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: i === 0 ? '2024-06-15' : '2024-07-15',
          status: 'completed',
        }),
        `seed revoke event ${i + 1}`
      )
    }
  })

  afterEach(async () => {
    await cleanupRiders(supabase)
  })

  afterAll(async () => {
    await fullCleanup(supabase)
  })

  it('clears the number when the only qualifying result flips to dns', async () => {
    await createRider(IDS.riderA, SLUGS.riderA, 'A')
    await addResult(IDS.riderA, IDS.event1, 'finished')
    expect(await riderNumber(IDS.riderA)).not.toBeNull()

    await checked(
      supabase.from('results').update({ status: 'dns' }).eq('rider_id', IDS.riderA),
      'flip to dns'
    )

    expect(await riderNumber(IDS.riderA)).toBeNull()
  })

  it('clears the number when the only qualifying result is deleted', async () => {
    await createRider(IDS.riderA, SLUGS.riderA, 'A')
    await addResult(IDS.riderA, IDS.event1, 'finished')
    expect(await riderNumber(IDS.riderA)).not.toBeNull()

    await checked(supabase.from('results').delete().eq('rider_id', IDS.riderA), 'delete result')

    expect(await riderNumber(IDS.riderA)).toBeNull()
  })

  it('keeps the number when another qualifying result remains', async () => {
    await createRider(IDS.riderA, SLUGS.riderA, 'A')
    await addResult(IDS.riderA, IDS.event1, 'finished')
    await addResult(IDS.riderA, IDS.event2, 'finished')
    const before = await riderNumber(IDS.riderA)
    expect(before).not.toBeNull()

    await checked(
      supabase
        .from('results')
        .update({ status: 'dns' })
        .eq('rider_id', IDS.riderA)
        .eq('event_id', IDS.event1),
      'flip one to dns'
    )

    expect(await riderNumber(IDS.riderA)).toBe(before)
  })

  it('moving a result to a numberless rider assigns them and revokes the old rider', async () => {
    await createRider(IDS.riderA, SLUGS.riderA, 'A')
    await createRider(IDS.riderB, SLUGS.riderB, 'B')
    await addResult(IDS.riderA, IDS.event1, 'finished')
    expect(await riderNumber(IDS.riderA)).not.toBeNull()
    expect(await riderNumber(IDS.riderB)).toBeNull()

    await checked(
      supabase.from('results').update({ rider_id: IDS.riderB }).eq('rider_id', IDS.riderA),
      'reassign result'
    )

    expect(await riderNumber(IDS.riderB)).not.toBeNull()
    expect(await riderNumber(IDS.riderA)).toBeNull()
  })

  it('issues a strictly higher number when a revoked rider re-qualifies', async () => {
    await createRider(IDS.riderA, SLUGS.riderA, 'A')
    await addResult(IDS.riderA, IDS.event1, 'finished')
    const first = await riderNumber(IDS.riderA)
    expect(first).not.toBeNull()

    await checked(
      supabase.from('results').update({ status: 'dns' }).eq('rider_id', IDS.riderA),
      'flip to dns'
    )
    expect(await riderNumber(IDS.riderA)).toBeNull()

    await checked(
      supabase.from('results').update({ status: 'finished' }).eq('rider_id', IDS.riderA),
      'flip back to finished'
    )

    const second = await riderNumber(IDS.riderA)
    expect(second).not.toBeNull()
    expect(second!).toBeGreaterThan(first!)
  })
})
