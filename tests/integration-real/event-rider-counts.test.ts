import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'
import { getEventRiderCounts } from '@/lib/data/event-rider-counts'

/**
 * Real-DB contract for the shared rider-count helper used by the admin
 * dashboard and the admin events list.
 *
 * The count shown to admins must reflect ACTIVE registrations only:
 *   - 'registered' and 'incomplete: membership' count
 *   - 'cancelled' does NOT count
 *   - a rider who both registered and has a result is counted once (dedup)
 *   - results-only riders (added directly by an admin) count
 *
 * This guards against the dashboard bug where cancelled registrations were
 * summed into the rider count.
 */

const IDS = {
  route: '00000000-e7c1-4000-a000-0000000000f0',
  eventWithRiders: '00000000-e7c1-4000-a000-0000ffff0001',
  eventEmpty: '00000000-e7c1-4000-a000-0000ffff0002',
  riderRegistered: '00000000-e7c1-4000-a000-0000000000a1',
  riderIncomplete: '00000000-e7c1-4000-a000-0000000000a2',
  riderCancelled: '00000000-e7c1-4000-a000-0000000000a3',
  riderResultOnly: '00000000-e7c1-4000-a000-0000000000a4',
  riderBoth: '00000000-e7c1-4000-a000-0000000000a5',
}

const ALL_RIDER_IDS = [
  IDS.riderRegistered,
  IDS.riderIncomplete,
  IDS.riderCancelled,
  IDS.riderResultOnly,
  IDS.riderBoth,
]
const ALL_EVENT_IDS = [IDS.eventWithRiders, IDS.eventEmpty]

async function fullCleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('registrations').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().in('id', ALL_EVENT_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
}

describe('getEventRiderCounts (real DB)', () => {
  const supabase = getTestSupabase()

  beforeAll(async () => {
    await fullCleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderRegistered,
          slug: 'inttest-erc-registered',
          first_name: 'IntERC',
          last_name: 'Registered',
        },
        {
          id: IDS.riderIncomplete,
          slug: 'inttest-erc-incomplete',
          first_name: 'IntERC',
          last_name: 'Incomplete',
        },
        {
          id: IDS.riderCancelled,
          slug: 'inttest-erc-cancelled',
          first_name: 'IntERC',
          last_name: 'Cancelled',
        },
        {
          id: IDS.riderResultOnly,
          slug: 'inttest-erc-resultonly',
          first_name: 'IntERC',
          last_name: 'ResultOnly',
        },
        { id: IDS.riderBoth, slug: 'inttest-erc-both', first_name: 'IntERC', last_name: 'Both' },
      ]),
      'seed rider-count test riders'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-erc-route',
        name: 'IntTest ERC Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed rider-count test route'
    )

    await checked(
      supabase.from('events').insert([
        {
          id: IDS.eventWithRiders,
          slug: 'inttest-erc-event-riders',
          name: 'IntTest ERC Event With Riders',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2026-06-15',
          status: 'completed',
        },
        {
          id: IDS.eventEmpty,
          slug: 'inttest-erc-event-empty',
          name: 'IntTest ERC Empty Event',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2026-07-15',
          status: 'scheduled',
        },
      ]),
      'seed rider-count test events'
    )

    await checked(
      supabase.from('registrations').insert([
        { rider_id: IDS.riderRegistered, event_id: IDS.eventWithRiders, status: 'registered' },
        {
          rider_id: IDS.riderIncomplete,
          event_id: IDS.eventWithRiders,
          status: 'incomplete: membership',
        },
        { rider_id: IDS.riderCancelled, event_id: IDS.eventWithRiders, status: 'cancelled' },
        { rider_id: IDS.riderBoth, event_id: IDS.eventWithRiders, status: 'registered' },
      ]),
      'seed rider-count test registrations'
    )

    await checked(
      supabase.from('results').insert([
        {
          rider_id: IDS.riderResultOnly,
          event_id: IDS.eventWithRiders,
          status: 'finished',
          season: 2026,
          distance_km: 200,
        },
        {
          rider_id: IDS.riderBoth,
          event_id: IDS.eventWithRiders,
          status: 'finished',
          season: 2026,
          distance_km: 200,
        },
      ]),
      'seed rider-count test results'
    )
  })

  afterAll(async () => {
    await fullCleanup(supabase)
  })

  it('counts active registrations and results, excluding cancelled and deduping', async () => {
    const counts = await getEventRiderCounts([IDS.eventWithRiders])

    // registered + incomplete:membership + result-only + both(deduped) = 4.
    // cancelled is excluded; riderBoth (registered + result) counts once.
    expect(counts[IDS.eventWithRiders]).toBe(4)
  })

  it('returns 0 for an event with no active riders', async () => {
    const counts = await getEventRiderCounts([IDS.eventEmpty])

    expect(counts[IDS.eventEmpty]).toBe(0)
  })

  it('returns an empty map for no event ids without hitting the DB', async () => {
    const counts = await getEventRiderCounts([])

    expect(counts).toEqual({})
  })
})
