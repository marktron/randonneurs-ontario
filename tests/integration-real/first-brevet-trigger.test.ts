import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// Covers the auto-assigned First Brevet award:
//   - A rider's first finished `brevet` result automatically receives First Brevet.
//   - populaire / fleche / permanent results never trigger the award.
//   - Out-of-order inserts move the award to the earliest qualifying result.
//   - Status changes / deletes / rider_id changes reconcile correctly.
//   - A partial unique index prevents two First Brevet rows for the same rider.

const IDS = {
  route: '00000000-fb01-4000-a000-000000000000',
  riderSolo: '00000000-fb01-4000-a000-0000000000a1',
  riderPop: '00000000-fb01-4000-a000-0000000000a2',
  riderFleche: '00000000-fb01-4000-a000-0000000000a3',
  riderPerm: '00000000-fb01-4000-a000-0000000000a4',
  riderDnf: '00000000-fb01-4000-a000-0000000000a5',
  riderOoO: '00000000-fb01-4000-a000-0000000000a6',
  riderStatus: '00000000-fb01-4000-a000-0000000000a7',
  riderDelete: '00000000-fb01-4000-a000-0000000000a8',
  riderUnique: '00000000-fb01-4000-a000-0000000000a9',
  eventBrevet2020: '00000000-fb01-4000-a000-0000ffff0001',
  eventBrevet2024: '00000000-fb01-4000-a000-0000ffff0002',
  eventBrevet2025: '00000000-fb01-4000-a000-0000ffff0003',
  eventPop2024: '00000000-fb01-4000-a000-0000ffff0004',
  eventFleche2024: '00000000-fb01-4000-a000-0000ffff0005',
  eventPerm2024: '00000000-fb01-4000-a000-0000ffff0006',
  eventBrevet2026: '00000000-fb01-4000-a000-0000ffff0007',
  eventBrevet2027: '00000000-fb01-4000-a000-0000ffff0008',
}

const SLUGS = {
  riderSolo: 'inttest-first-brevet-solo',
  riderPop: 'inttest-first-brevet-pop',
  riderFleche: 'inttest-first-brevet-fleche',
  riderPerm: 'inttest-first-brevet-perm',
  riderDnf: 'inttest-first-brevet-dnf',
  riderOoO: 'inttest-first-brevet-ooo',
  riderStatus: 'inttest-first-brevet-status',
  riderDelete: 'inttest-first-brevet-delete',
  riderUnique: 'inttest-first-brevet-unique',
}

const ALL_RIDER_IDS = Object.values(IDS).filter((id) => id.includes('00000000a'))
const ALL_EVENT_IDS = Object.values(IDS).filter((id) => id.includes('0000ffff'))

async function deleteRiderResults(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
}

async function fullCleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await deleteRiderResults(supabase)
  await supabase.from('events').delete().in('id', ALL_EVENT_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
}

describe('First Brevet auto-assignment (real DB)', () => {
  const supabase = getTestSupabase()
  let firstBrevetAwardId: string

  beforeAll(async () => {
    const { data: award, error } = await supabase
      .from('awards')
      .select('id')
      .eq('slug', 'first-brevet')
      .single()
    if (error || !award) throw new Error('first-brevet award not found — seed your DB')
    firstBrevetAwardId = award.id

    await fullCleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        { id: IDS.riderSolo, slug: SLUGS.riderSolo, first_name: 'IntFB', last_name: 'Solo' },
        { id: IDS.riderPop, slug: SLUGS.riderPop, first_name: 'IntFB', last_name: 'Pop' },
        { id: IDS.riderFleche, slug: SLUGS.riderFleche, first_name: 'IntFB', last_name: 'Fleche' },
        { id: IDS.riderPerm, slug: SLUGS.riderPerm, first_name: 'IntFB', last_name: 'Perm' },
        { id: IDS.riderDnf, slug: SLUGS.riderDnf, first_name: 'IntFB', last_name: 'Dnf' },
        { id: IDS.riderOoO, slug: SLUGS.riderOoO, first_name: 'IntFB', last_name: 'OoO' },
        { id: IDS.riderStatus, slug: SLUGS.riderStatus, first_name: 'IntFB', last_name: 'Status' },
        { id: IDS.riderDelete, slug: SLUGS.riderDelete, first_name: 'IntFB', last_name: 'Delete' },
        { id: IDS.riderUnique, slug: SLUGS.riderUnique, first_name: 'IntFB', last_name: 'Unique' },
      ]),
      'seed first-brevet test riders'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-first-brevet-route',
        name: 'IntTest First Brevet Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'seed first-brevet test route'
    )

    await checked(
      supabase.from('events').insert([
        {
          id: IDS.eventBrevet2020,
          slug: 'inttest-fb-brevet-2020',
          name: 'IntTest FB Brevet 2020',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2020-06-15',
          status: 'completed',
        },
        {
          id: IDS.eventBrevet2024,
          slug: 'inttest-fb-brevet-2024',
          name: 'IntTest FB Brevet 2024',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2024-06-15',
          status: 'completed',
        },
        {
          id: IDS.eventBrevet2025,
          slug: 'inttest-fb-brevet-2025',
          name: 'IntTest FB Brevet 2025',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2025-06-15',
          status: 'completed',
        },
        {
          id: IDS.eventPop2024,
          slug: 'inttest-fb-pop-2024',
          name: 'IntTest FB Pop 2024',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'populaire',
          distance_km: 100,
          event_date: '2024-05-15',
          status: 'completed',
        },
        {
          id: IDS.eventFleche2024,
          slug: 'inttest-fb-fleche-2024',
          name: 'IntTest FB Fleche 2024',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'fleche',
          distance_km: 360,
          event_date: '2024-04-15',
          status: 'completed',
        },
        {
          id: IDS.eventPerm2024,
          slug: 'inttest-fb-perm-2024',
          name: 'IntTest FB Perm 2024',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'permanent',
          distance_km: 200,
          event_date: '2024-07-15',
          status: 'completed',
        },
        {
          id: IDS.eventBrevet2026,
          slug: 'inttest-fb-brevet-2026',
          name: 'IntTest FB Brevet 2026',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2026-06-15',
          status: 'completed',
        },
        {
          id: IDS.eventBrevet2027,
          slug: 'inttest-fb-brevet-2027',
          name: 'IntTest FB Brevet 2027',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'brevet',
          distance_km: 200,
          event_date: '2027-06-15',
          status: 'completed',
        },
      ]),
      'seed first-brevet test events'
    )
  })

  afterEach(async () => {
    await deleteRiderResults(supabase)
  })

  afterAll(async () => {
    await fullCleanup(supabase)
  })

  async function getFirstBrevetResultIds(riderId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('result_awards')
      .select('result_id, results!inner(rider_id)')
      .eq('award_id', firstBrevetAwardId)
      .eq('results.rider_id', riderId)
    if (error) throw error
    return (data ?? []).map((row) => row.result_id as string)
  }

  it('auto-assigns First Brevet on a rider’s first finished brevet result', async () => {
    const resultId = '00000000-fb01-4000-b000-000000000001'
    await checked(
      supabase.from('results').insert({
        id: resultId,
        event_id: IDS.eventBrevet2024,
        rider_id: IDS.riderSolo,
        status: 'finished',
        season: 2024,
        distance_km: 200,
      }),
      'insert solo finished brevet'
    )

    expect(await getFirstBrevetResultIds(IDS.riderSolo)).toEqual([resultId])
  })

  it('does not assign First Brevet for a finished populaire', async () => {
    await checked(
      supabase.from('results').insert({
        event_id: IDS.eventPop2024,
        rider_id: IDS.riderPop,
        status: 'finished',
        season: 2024,
        distance_km: 100,
      }),
      'insert populaire'
    )
    expect(await getFirstBrevetResultIds(IDS.riderPop)).toEqual([])
  })

  it('does not assign First Brevet for a finished fleche', async () => {
    await checked(
      supabase.from('results').insert({
        event_id: IDS.eventFleche2024,
        rider_id: IDS.riderFleche,
        status: 'finished',
        season: 2024,
        distance_km: 360,
      }),
      'insert fleche'
    )
    expect(await getFirstBrevetResultIds(IDS.riderFleche)).toEqual([])
  })

  it('does not assign First Brevet for a finished permanent', async () => {
    await checked(
      supabase.from('results').insert({
        event_id: IDS.eventPerm2024,
        rider_id: IDS.riderPerm,
        status: 'finished',
        season: 2024,
        distance_km: 200,
      }),
      'insert permanent'
    )
    expect(await getFirstBrevetResultIds(IDS.riderPerm)).toEqual([])
  })

  it('does not assign First Brevet for a brevet result that is not finished', async () => {
    await checked(
      supabase.from('results').insert({
        event_id: IDS.eventBrevet2024,
        rider_id: IDS.riderDnf,
        status: 'dnf',
        season: 2024,
        distance_km: 200,
      }),
      'insert dnf brevet'
    )
    expect(await getFirstBrevetResultIds(IDS.riderDnf)).toEqual([])
  })

  it('moves the award to an earlier brevet when results are inserted out of order', async () => {
    const laterResultId = '00000000-fb01-4000-b000-000000000010'
    const earlierResultId = '00000000-fb01-4000-b000-000000000011'

    // Later result inserted first → it gets the award.
    await checked(
      supabase.from('results').insert({
        id: laterResultId,
        event_id: IDS.eventBrevet2025,
        rider_id: IDS.riderOoO,
        status: 'finished',
        season: 2025,
        distance_km: 200,
      }),
      'insert later brevet first'
    )
    expect(await getFirstBrevetResultIds(IDS.riderOoO)).toEqual([laterResultId])

    // Earlier result inserted after → award moves to the earlier one.
    await checked(
      supabase.from('results').insert({
        id: earlierResultId,
        event_id: IDS.eventBrevet2020,
        rider_id: IDS.riderOoO,
        status: 'finished',
        season: 2020,
        distance_km: 200,
      }),
      'insert earlier brevet second'
    )
    expect(await getFirstBrevetResultIds(IDS.riderOoO)).toEqual([earlierResultId])
  })

  it('reassigns the award when the awarded result’s status changes from finished to dnf', async () => {
    const dnfResultId = '00000000-fb01-4000-b000-000000000020'
    const stillFinishedResultId = '00000000-fb01-4000-b000-000000000021'

    await checked(
      supabase.from('results').insert([
        {
          id: dnfResultId,
          event_id: IDS.eventBrevet2024,
          rider_id: IDS.riderStatus,
          status: 'finished',
          season: 2024,
          distance_km: 200,
        },
        {
          id: stillFinishedResultId,
          event_id: IDS.eventBrevet2025,
          rider_id: IDS.riderStatus,
          status: 'finished',
          season: 2025,
          distance_km: 200,
        },
      ]),
      'insert two finished brevets'
    )
    expect(await getFirstBrevetResultIds(IDS.riderStatus)).toEqual([dnfResultId])

    // Flip the earliest result to dnf — the award should move to the next earliest finished brevet.
    await checked(
      supabase.from('results').update({ status: 'dnf' }).eq('id', dnfResultId),
      'flip earliest brevet to dnf'
    )
    expect(await getFirstBrevetResultIds(IDS.riderStatus)).toEqual([stillFinishedResultId])
  })

  it('removes the award when the rider has no remaining finished brevet results', async () => {
    const onlyResultId = '00000000-fb01-4000-b000-000000000030'
    await checked(
      supabase.from('results').insert({
        id: onlyResultId,
        event_id: IDS.eventBrevet2024,
        rider_id: IDS.riderDelete,
        status: 'finished',
        season: 2024,
        distance_km: 200,
      }),
      'insert only brevet'
    )
    expect(await getFirstBrevetResultIds(IDS.riderDelete)).toEqual([onlyResultId])

    await checked(supabase.from('results').delete().eq('id', onlyResultId), 'delete only brevet')
    expect(await getFirstBrevetResultIds(IDS.riderDelete)).toEqual([])
  })

  it('keeps only the earliest award when riders with multiple results each are merged', async () => {
    // Both riders have multiple finished brevets and their own First Brevet.
    // After a merge that moves the source rider's results onto the target,
    // exactly one First Brevet should remain — on the overall earliest.
    const targetEarlierId = '00000000-fb01-4000-b000-000000000060'
    const targetLaterId = '00000000-fb01-4000-b000-000000000061'
    const sourceEarlierId = '00000000-fb01-4000-b000-000000000062'
    const sourceLaterId = '00000000-fb01-4000-b000-000000000063'

    const targetRider = IDS.riderOoO
    const sourceRider = IDS.riderStatus

    // Target rider: 2024 + 2025; First Brevet on 2024
    // Source rider: 2020 + 2026; First Brevet on 2020
    await checked(
      supabase.from('results').insert([
        {
          id: targetEarlierId,
          event_id: IDS.eventBrevet2024,
          rider_id: targetRider,
          status: 'finished',
          season: 2024,
          distance_km: 200,
        },
        {
          id: targetLaterId,
          event_id: IDS.eventBrevet2025,
          rider_id: targetRider,
          status: 'finished',
          season: 2025,
          distance_km: 200,
        },
        {
          id: sourceEarlierId,
          event_id: IDS.eventBrevet2020,
          rider_id: sourceRider,
          status: 'finished',
          season: 2020,
          distance_km: 200,
        },
        {
          id: sourceLaterId,
          event_id: IDS.eventBrevet2026,
          rider_id: sourceRider,
          status: 'finished',
          season: 2026,
          distance_km: 200,
        },
      ]),
      'seed multi-result merge test'
    )

    expect(await getFirstBrevetResultIds(targetRider)).toEqual([targetEarlierId])
    expect(await getFirstBrevetResultIds(sourceRider)).toEqual([sourceEarlierId])

    // Merge: bulk-update source results' rider_id to target — mirrors the
    // `update(rider_id).in('id', moveResultIds)` call in mergeRiders().
    await checked(
      supabase
        .from('results')
        .update({ rider_id: targetRider })
        .in('id', [sourceEarlierId, sourceLaterId]),
      'merge: bulk move source results to target'
    )

    // Target should now hold a single First Brevet on the overall earliest (2020).
    expect(await getFirstBrevetResultIds(targetRider)).toEqual([sourceEarlierId])
    expect(await getFirstBrevetResultIds(sourceRider)).toEqual([])
  })

  it('keeps only the earliest result’s award when two riders are merged', async () => {
    // Simulate the merge flow: each rider starts with their own finished brevet
    // and an auto-assigned First Brevet on it. After merging, the surviving rider
    // should have the award on the earliest result only.
    const earlierResultId = '00000000-fb01-4000-b000-000000000050'
    const laterResultId = '00000000-fb01-4000-b000-000000000051'

    // Set up two riders with their own finished brevets (different events).
    // We reuse riderStatus (target) and riderDelete (source) — they have no
    // results in this test thanks to afterEach.
    const targetRider = IDS.riderStatus
    const sourceRider = IDS.riderDelete

    await checked(
      supabase.from('results').insert([
        {
          id: earlierResultId,
          event_id: IDS.eventBrevet2020,
          rider_id: targetRider,
          status: 'finished',
          season: 2020,
          distance_km: 200,
        },
        {
          id: laterResultId,
          event_id: IDS.eventBrevet2024,
          rider_id: sourceRider,
          status: 'finished',
          season: 2024,
          distance_km: 200,
        },
      ]),
      'seed merge test results'
    )

    // Sanity check: each rider has their own First Brevet.
    expect(await getFirstBrevetResultIds(targetRider)).toEqual([earlierResultId])
    expect(await getFirstBrevetResultIds(sourceRider)).toEqual([laterResultId])

    // Merge: move the source rider's result over to the target rider.
    await checked(
      supabase.from('results').update({ rider_id: targetRider }).eq('id', laterResultId),
      'merge: move later result onto target rider'
    )

    // Target should keep only the earliest result's award.
    expect(await getFirstBrevetResultIds(targetRider)).toEqual([earlierResultId])
    // Source no longer has any results → no award.
    expect(await getFirstBrevetResultIds(sourceRider)).toEqual([])
  })

  it('refuses a manual duplicate First Brevet row for the same rider', async () => {
    const resultA = '00000000-fb01-4000-b000-000000000040'
    const resultB = '00000000-fb01-4000-b000-000000000041'

    await checked(
      supabase.from('results').insert([
        {
          id: resultA,
          event_id: IDS.eventBrevet2026,
          rider_id: IDS.riderUnique,
          status: 'finished',
          season: 2026,
          distance_km: 200,
        },
        {
          id: resultB,
          event_id: IDS.eventBrevet2027,
          rider_id: IDS.riderUnique,
          status: 'finished',
          season: 2027,
          distance_km: 200,
        },
      ]),
      'insert two brevets for unique-rider'
    )

    // Trigger should have given exactly one award (the earliest).
    expect(await getFirstBrevetResultIds(IDS.riderUnique)).toEqual([resultA])

    // A second First Brevet row on the same rider must be rejected by the unique index.
    const { error } = await supabase
      .from('result_awards')
      .insert({ result_id: resultB, award_id: firstBrevetAwardId })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/unique|duplicate/i)
  })
})
