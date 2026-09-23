import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'
import {
  announceNewAwards,
  fetchUnannouncedResultAwards,
  fetchUnannouncedRiderAwards,
  type UnannouncedResultAwardRow,
  type UnannouncedRiderAwardRow,
} from '@/lib/awards/announce-awards'
import type { Database } from '@/types/supabase'

// The Slack award announcer reads `announced_at IS NULL` rows from both award
// tables through nested PostgREST embeds. The mock suite can't tell whether
// those embeds resolve (or come back as arrays instead of objects), so this
// suite runs the exact exported fetches against the local DB, then a full
// sweep with only the Slack webhook stubbed.

const supabase = getTestSupabase()
const typed = supabase as unknown as SupabaseClient<Database>

const IDS = {
  route: '00000000-a110-4000-a000-000000000001',
  event: '00000000-a110-4000-a000-000000000002',
  visibleRider: '00000000-a110-4000-a000-0000000000a1',
  hiddenRider: '00000000-a110-4000-a000-0000000000a2',
  visibleResult: '00000000-a110-4000-a000-0000000000c1',
  hiddenResult: '00000000-a110-4000-a000-0000000000c2',
}
const SLUGS = {
  route: 'inttest-announce-route',
  event: 'inttest-announce-event',
  visible: 'inttest-announce-visible',
  hidden: 'inttest-announce-hidden',
}
const RIDER_IDS = [IDS.visibleRider, IDS.hiddenRider]
const EVENT_NAME = 'IntTest Announce Brevet'
const VISIBLE_NAME = { first_name: 'IntAnnounce', last_name: 'Visible' }
const HIDDEN_NAME = { first_name: 'IntAnnounce', last_name: 'Hiddenperson' }

// Relative date: a fixed one would drift from "current season" over time.
const EVENT_DATE = daysFromNow(-14)
const SEASON = Number(EVENT_DATE.slice(0, 4))
const WEBHOOK = 'https://hooks.slack.test/services/T000/B000/inttest'

async function cleanup(): Promise<void> {
  await supabase.from('rider_awards').delete().in('rider_id', RIDER_IDS)
  // result_awards cascade from results.
  await supabase.from('results').delete().in('rider_id', RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('events').delete().in('id', [IDS.event])
  await supabase.from('events').delete().eq('slug', SLUGS.event)
  await supabase.from('routes').delete().eq('id', IDS.route)
  await supabase.from('routes').delete().eq('slug', SLUGS.route)
  await supabase.from('riders').delete().in('id', RIDER_IDS)
  await supabase.from('riders').delete().in('slug', [SLUGS.visible, SLUGS.hidden])
}

let srAwardId: string
let firstBrevetAwardId: string
// O-12 has award_type = 'result' in the local DB (confirmed via
// `select id, slug, award_type from awards where slug = 'o-12'`) even though
// it's listed under "season" scope in docs/awards.md's Available Awards
// table -- it lives in result_awards, not rider_awards, and there's no
// auto-assign trigger for it yet, so this suite seeds a row by hand.
let o12AwardId: string

beforeEach(async () => {
  await cleanup()

  const awards = await checked(
    supabase
      .from('awards')
      .select('id, slug')
      .in('slug', ['super-randonneur', 'first-brevet', 'o-12']),
    'load award ids'
  )
  const bySlug = new Map((awards as { id: string; slug: string }[]).map((a) => [a.slug, a.id]))
  srAwardId = bySlug.get('super-randonneur')!
  firstBrevetAwardId = bySlug.get('first-brevet')!
  o12AwardId = bySlug.get('o-12')!
  if (!srAwardId || !firstBrevetAwardId || !o12AwardId) {
    throw new Error('award rows missing; seed your DB')
  }

  await checked(
    supabase.from('riders').insert([
      { id: IDS.visibleRider, slug: SLUGS.visible, ...VISIBLE_NAME, hidden: false },
      { id: IDS.hiddenRider, slug: SLUGS.hidden, ...HIDDEN_NAME, hidden: true },
    ]),
    'seed riders'
  )
  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: SLUGS.route,
      name: 'IntTest Announce Route',
      chapter_id: TORONTO_CHAPTER_ID,
      distance_km: 200,
      is_active: true,
    }),
    'seed route'
  )
  await checked(
    supabase.from('events').insert({
      id: IDS.event,
      slug: SLUGS.event,
      name: EVENT_NAME,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: 200,
      event_date: EVENT_DATE,
      status: 'completed',
    }),
    'seed event'
  )
  // Finished brevets: the First Brevet trigger writes result_awards rows.
  await checked(
    supabase.from('results').insert([
      {
        id: IDS.visibleResult,
        event_id: IDS.event,
        rider_id: IDS.visibleRider,
        status: 'finished',
        season: SEASON,
        distance_km: 200,
      },
      {
        id: IDS.hiddenResult,
        event_id: IDS.event,
        rider_id: IDS.hiddenRider,
        status: 'finished',
        season: SEASON,
        distance_km: 200,
      },
    ]),
    'seed results'
  )
  // Manual season awards (same keys on every row).
  await checked(
    supabase.from('rider_awards').insert([
      { rider_id: IDS.visibleRider, award_id: srAwardId, season: SEASON, auto_assigned: false },
      { rider_id: IDS.hiddenRider, award_id: srAwardId, season: SEASON, auto_assigned: false },
    ]),
    'seed manual SR rows'
  )
  // O-12 result award for the visible rider only: it's the one result-scoped
  // award on the allowlist (ANNOUNCED_RESULT_AWARD_SLUGS), so it should post
  // while the trigger-written First Brevet rows above stay silent.
  await checked(
    supabase.from('result_awards').insert({ result_id: IDS.visibleResult, award_id: o12AwardId }),
    'seed O-12 result award'
  )
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

async function seededRiderAwards(): Promise<UnannouncedRiderAwardRow[]> {
  const { data, error } = await fetchUnannouncedRiderAwards(typed)
  if (error) throw new Error(`fetchUnannouncedRiderAwards: ${error.message}`)
  return ((data ?? []) as unknown as UnannouncedRiderAwardRow[]).filter((r) =>
    RIDER_IDS.includes(r.riders.id)
  )
}

async function seededResultAwards(): Promise<UnannouncedResultAwardRow[]> {
  const { data, error } = await fetchUnannouncedResultAwards(typed)
  if (error) throw new Error(`fetchUnannouncedResultAwards: ${error.message}`)
  return ((data ?? []) as unknown as UnannouncedResultAwardRow[]).filter((r) =>
    RIDER_IDS.includes(r.results.riders.id)
  )
}

describe('award announcements outbox (real DB)', () => {
  it('leaves announced_at NULL on newly written award rows', async () => {
    const riderRows = await checked(
      supabase.from('rider_awards').select('announced_at').in('rider_id', RIDER_IDS),
      'read rider_awards'
    )
    expect(riderRows).toHaveLength(2)
    for (const row of riderRows as { announced_at: string | null }[]) {
      expect(row.announced_at).toBeNull()
    }

    const resultRows = await checked(
      supabase
        .from('result_awards')
        .select('announced_at')
        .in('result_id', [IDS.visibleResult, IDS.hiddenResult])
        .eq('award_id', firstBrevetAwardId),
      'read result_awards'
    )
    expect(resultRows).toHaveLength(2)
    for (const row of resultRows as { announced_at: string | null }[]) {
      expect(row.announced_at).toBeNull()
    }
  })

  it('fetches season awards with the rider and award embedded as objects', async () => {
    const rows = await seededRiderAwards()
    expect(rows).toHaveLength(2)
    const visible = rows.find((r) => r.riders.id === IDS.visibleRider)!
    expect(visible).toMatchObject({
      season: SEASON,
      riders: {
        id: IDS.visibleRider,
        slug: SLUGS.visible,
        first_name: VISIBLE_NAME.first_name,
        last_name: VISIBLE_NAME.last_name,
        hidden: false,
      },
      awards: { slug: 'super-randonneur', title: 'Super Randonneur' },
    })
    expect(typeof visible.id).toBe('string')
    const hidden = rows.find((r) => r.riders.id === IDS.hiddenRider)!
    expect(hidden.riders.hidden).toBe(true)
  })

  it('fetches result awards with result, rider, event and chapter embedded', async () => {
    const rows = (await seededResultAwards()).filter((r) => r.award_id === firstBrevetAwardId)
    expect(rows).toHaveLength(2)
    const visible = rows.find((r) => r.result_id === IDS.visibleResult)!
    expect(visible).toMatchObject({
      result_id: IDS.visibleResult,
      award_id: firstBrevetAwardId,
      awards: { slug: 'first-brevet', title: 'First Brevet' },
      results: {
        id: IDS.visibleResult,
        season: SEASON,
        riders: {
          id: IDS.visibleRider,
          slug: SLUGS.visible,
          first_name: VISIBLE_NAME.first_name,
          last_name: VISIBLE_NAME.last_name,
          hidden: false,
        },
        events: { name: EVENT_NAME, event_date: EVENT_DATE },
      },
    })
  })

  it('posts only the visible rider, stamps every seeded row, and does not repeat', async () => {
    vi.stubEnv('SLACK_AWARDS_WEBHOOK_URL', WEBHOOK)
    const realFetch = globalThis.fetch
    const posted: string[] = []
    // Pass everything but the webhook through: supabase-js uses fetch too.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === WEBHOOK) {
          posted.push(JSON.parse(init!.body as string).text)
          return new Response('ok', { status: 200 })
        }
        return realFetch(input, init)
      })
    )

    const first = await announceNewAwards()
    expect(first.configured).toBe(true)
    expect(first.posted).toBeGreaterThanOrEqual(1)

    const text = posted.join('\n')
    expect(text).toContain(`${VISIBLE_NAME.first_name} ${VISIBLE_NAME.last_name}`)
    expect(text).toContain(`/riders/${SLUGS.visible}|`)
    expect(text).toContain(`*Super Randonneur ${SEASON}*`)
    // First Brevet is result-scoped and not on ANNOUNCED_RESULT_AWARD_SLUGS:
    // the trigger-written rows for both riders are stamped but never posted.
    expect(text).not.toContain('*First Brevet*')
    // O-12 is the one allowlisted result award, so it does post.
    expect(text).toContain('*O-12*')
    expect(text).toContain(EVENT_NAME)
    expect(text).not.toContain(HIDDEN_NAME.last_name)
    expect(text).not.toContain(SLUGS.hidden)

    const riderRows = await checked(
      supabase.from('rider_awards').select('announced_at').in('rider_id', RIDER_IDS),
      'read stamped rider_awards'
    )
    expect(riderRows).toHaveLength(2)
    for (const row of riderRows as { announced_at: string | null }[]) {
      expect(row.announced_at).not.toBeNull()
    }
    const resultRows = await checked(
      supabase
        .from('result_awards')
        .select('announced_at')
        .in('result_id', [IDS.visibleResult, IDS.hiddenResult]),
      'read stamped result_awards'
    )
    // Two trigger-written First Brevet rows (visible + hidden) plus the
    // manually seeded O-12 row: all three get stamped, posted or not.
    expect(resultRows).toHaveLength(3)
    for (const row of resultRows as { announced_at: string | null }[]) {
      expect(row.announced_at).not.toBeNull()
    }

    // Second sweep: nothing of ours is left to fetch or post.
    expect(await seededRiderAwards()).toHaveLength(0)
    expect(await seededResultAwards()).toHaveLength(0)
    posted.length = 0
    await announceNewAwards()
    expect(posted.join('\n')).not.toContain(VISIBLE_NAME.last_name)
  })
})
