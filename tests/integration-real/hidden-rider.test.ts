import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'
import { getMyUpcomingRides } from '@/lib/actions/my-rides'

// A "hidden" rider must NEVER appear on public-facing surfaces (riders
// directory, results, awards, records, registered-rider lists) but must remain
// fully visible to admins (service role) and able to see their own upcoming
// rides. These tests exercise the real RLS policy + the SECURITY DEFINER RPCs
// through the anon role, which is what the public site uses.

const admin = getTestSupabase() // service role — bypasses RLS, used for seeding

function getAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('[integration-real] Missing SUPABASE anon env vars.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
const anon = getAnonClient()

const CHAPTER_ID = TORONTO_CHAPTER_ID
const SEASON = 2099 // far-future season isolates fixtures from real data

const IDS = {
  route: '00000000-1111-4000-a000-00000000a000',
  completedEvent: '00000000-1111-4000-a000-00000000a001',
  scheduledEvent: '00000000-1111-4000-a000-00000000a002',
  hiddenRider: '00000000-1111-4000-a000-00000000b001',
  visibleRider: '00000000-1111-4000-a000-00000000b002',
  hiddenResult: '00000000-1111-4000-a000-00000000c001',
  visibleResult: '00000000-1111-4000-a000-00000000c002',
}

const SLUGS = {
  hidden: 'inttest-hidden-rider',
  visible: 'inttest-visible-rider',
}

const EMAILS = {
  hidden: 'inttest-hidden@example.com',
  visible: 'inttest-visible@example.com',
}

const RIDER_IDS = [IDS.hiddenRider, IDS.visibleRider]
let srAwardId: string

async function cleanup(): Promise<void> {
  // Order matters: results cascade their result_awards; everything else by FK.
  await admin.from('rider_awards').delete().in('rider_id', RIDER_IDS)
  await admin.from('results').delete().in('rider_id', RIDER_IDS)
  await admin.from('registrations').delete().in('rider_id', RIDER_IDS)
  await admin.from('events').delete().in('id', [IDS.completedEvent, IDS.scheduledEvent])
  await admin.from('events').delete().eq('route_id', IDS.route)
  await admin.from('routes').delete().eq('id', IDS.route)
  // Clean by both id and the shared natural keys (slug/email) so a prior failed
  // run leaves nothing behind that would break unique-constraint inserts.
  await admin.from('riders').delete().in('id', RIDER_IDS)
  await admin.from('riders').delete().in('slug', [SLUGS.hidden, SLUGS.visible])
  await admin.from('riders').delete().in('email', [EMAILS.hidden, EMAILS.visible])
}

beforeAll(async () => {
  const award = await checked(
    admin.from('awards').select('id').eq('slug', 'super-randonneur').single(),
    'load super-randonneur award id'
  )
  srAwardId = (award as { id: string }).id

  await cleanup()

  await checked(
    admin.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-hidden-route',
      chapter_id: CHAPTER_ID,
      name: 'IntTest Hidden Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )

  await checked(
    admin.from('events').insert([
      {
        id: IDS.completedEvent,
        slug: 'inttest-hidden-completed',
        name: 'IntTest Hidden Completed',
        chapter_id: CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: `${SEASON}-06-15`,
        status: 'completed',
      },
      {
        id: IDS.scheduledEvent,
        slug: 'inttest-hidden-scheduled',
        name: 'IntTest Hidden Scheduled',
        chapter_id: CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: daysFromNow(30),
        status: 'scheduled',
      },
    ]),
    'seed events'
  )

  await checked(
    admin.from('riders').insert([
      {
        id: IDS.hiddenRider,
        slug: SLUGS.hidden,
        first_name: 'Hidden',
        last_name: 'Rider',
        email: EMAILS.hidden,
        hidden: true,
      },
      {
        id: IDS.visibleRider,
        slug: SLUGS.visible,
        first_name: 'Visible',
        last_name: 'Rider',
        email: EMAILS.visible,
        hidden: false,
      },
    ]),
    'seed riders'
  )

  // A finished result for each rider on the completed event.
  await checked(
    admin.from('results').insert([
      {
        id: IDS.hiddenResult,
        event_id: IDS.completedEvent,
        rider_id: IDS.hiddenRider,
        status: 'finished',
        finish_time: '13:30:00',
        season: SEASON,
        distance_km: 200,
      },
      {
        id: IDS.visibleResult,
        event_id: IDS.completedEvent,
        rider_id: IDS.visibleRider,
        status: 'finished',
        finish_time: '13:30:00',
        season: SEASON,
        distance_km: 200,
      },
    ]),
    'seed results'
  )

  // A season-scoped Super Randonneur award for each rider.
  await checked(
    admin.from('rider_awards').insert([
      { rider_id: IDS.hiddenRider, award_id: srAwardId, season: SEASON },
      { rider_id: IDS.visibleRider, award_id: srAwardId, season: SEASON },
    ]),
    'seed rider_awards'
  )

  // Each rider registers (sharing) for the upcoming scheduled event.
  await checked(
    admin.from('registrations').insert([
      {
        event_id: IDS.scheduledEvent,
        rider_id: IDS.hiddenRider,
        status: 'registered',
        share_registration: true,
      },
      {
        event_id: IDS.scheduledEvent,
        rider_id: IDS.visibleRider,
        status: 'registered',
        share_registration: true,
      },
    ]),
    'seed registrations'
  )
})

afterAll(async () => {
  await cleanup()
})

describe('hidden rider suppression', () => {
  it('hides the rider from the base riders table for anon (RLS boundary)', async () => {
    const { data } = await anon.from('riders').select('id').in('id', RIDER_IDS)
    const ids = (data ?? []).map((r) => r.id)
    expect(ids).toContain(IDS.visibleRider)
    expect(ids).not.toContain(IDS.hiddenRider)
  })

  it('hides the rider from the public_riders directory view', async () => {
    const { data } = await anon
      .from('public_riders')
      .select('slug')
      .in('slug', [SLUGS.hidden, SLUGS.visible])
    const slugs = (data ?? []).map((r) => r.slug)
    expect(slugs).toContain(SLUGS.visible)
    expect(slugs).not.toContain(SLUGS.hidden)
  })

  it("hides the rider's results from the public_results view", async () => {
    const { data } = await anon
      .from('public_results')
      .select('rider_slug')
      .eq('event_id', IDS.completedEvent)
    const slugs = (data ?? []).map((r) => r.rider_slug)
    expect(slugs).toContain(SLUGS.visible)
    expect(slugs).not.toContain(SLUGS.hidden)
  })

  it('excludes the rider from record leaderboards (completion counts)', async () => {
    const { data } = await anon.rpc('get_rider_completion_counts', { limit_count: 1000 })
    const slugs = (data ?? []).map((r: { rider_slug: string }) => r.rider_slug)
    expect(slugs).toContain(SLUGS.visible)
    expect(slugs).not.toContain(SLUGS.hidden)
  })

  it('excludes the rider from award recipient lists', async () => {
    const { data } = await anon.rpc('get_award_recipients', { p_award_slug: 'super-randonneur' })
    const slugs = (data ?? []).map((r: { rider_slug: string }) => r.rider_slug)
    expect(slugs).toContain(SLUGS.visible)
    expect(slugs).not.toContain(SLUGS.hidden)
  })

  it('excludes the rider from award-count leaderboards', async () => {
    const { data } = await anon.rpc('get_rider_award_counts', {
      p_award_slug: 'super-randonneur',
      limit_count: 1000,
    })
    const slugs = (data ?? []).map((r: { rider_slug: string }) => r.rider_slug)
    expect(slugs).toContain(SLUGS.visible)
    expect(slugs).not.toContain(SLUGS.hidden)
  })

  it('keeps the rider on the registered list but forces Anonymous (counted, never named)', async () => {
    const { data } = await anon.rpc('get_registered_riders', { p_event_id: IDS.scheduledEvent })
    const rows = (data ?? []) as Array<{
      first_name: string | null
      last_name: string | null
      share_registration: boolean
    }>
    // Both registrations are present and counted.
    expect(rows).toHaveLength(2)

    // The visible rider shares and is named.
    const visible = rows.filter((r) => r.first_name === 'Visible')
    expect(visible).toHaveLength(1)
    expect(visible[0].share_registration).toBe(true)

    // The hidden rider is forced anonymous despite share_registration = true:
    // no name leaks and the effective share flag is false.
    const named = rows.filter((r) => r.first_name === 'Hidden')
    expect(named).toHaveLength(0)
    const anonymous = rows.filter((r) => r.share_registration === false)
    expect(anonymous).toHaveLength(1)
    expect(anonymous[0].first_name).toBeNull()
    expect(anonymous[0].last_name).toBeNull()
  })

  it('still counts the rider in nameless aggregates (route participant counts)', async () => {
    const { data } = await anon.rpc('get_route_participant_counts', { limit_count: 1000 })
    const route = (data ?? []).find(
      (r: { route_slug: string }) => r.route_slug === 'inttest-hidden-route'
    ) as { value: number } | undefined
    expect(route).toBeDefined()
    // Both the hidden and visible rider have a finished result on this route.
    expect(Number(route!.value)).toBe(2)
  })

  it('still shows the hidden rider their own upcoming rides (My Rides)', async () => {
    const result = await getMyUpcomingRides(EMAILS.hidden)
    expect(result.success).toBe(true)
    const slugs = (result.data ?? []).map((r) => r.slug)
    expect(slugs).toContain('inttest-hidden-scheduled')
  })

  it('remains fully visible to admins (service role bypasses RLS)', async () => {
    const { data } = await admin
      .from('riders')
      .select('id, hidden')
      .eq('id', IDS.hiddenRider)
      .single()
    expect(data?.id).toBe(IDS.hiddenRider)
    expect(data?.hidden).toBe(true)
  })
})
