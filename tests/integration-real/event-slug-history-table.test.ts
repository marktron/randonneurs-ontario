import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

// event_slug_history keeps old event slugs so rescheduled events keep
// their links working. Anon reads go through events RLS via the join.

const admin = getTestSupabase() // service role: bypasses RLS

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

const SEASON = 2099
const IDS = {
  scheduled: '00000000-2222-4000-a000-00000000e001',
  draft: '00000000-2222-4000-a000-00000000e002',
  eventA: '00000000-2222-4000-a000-00000000e003',
  eventB: '00000000-2222-4000-a000-00000000e004',
  cascade: '00000000-2222-4000-a000-00000000e005',
}
const SLUGS = {
  scheduled: `inttest-slug-hist-scheduled-200km-${SEASON}-05-09`,
  draft: `inttest-slug-hist-draft-200km-${SEASON}-05-02`,
  eventA: `inttest-slug-hist-a-200km-${SEASON}-06-06`,
  eventB: `inttest-slug-hist-b-200km-${SEASON}-06-13`,
  cascade: `inttest-slug-hist-cascade-200km-${SEASON}-06-20`,
}
const OLD = {
  scheduled: `inttest-slug-hist-old-scheduled-200km-${SEASON}-05-02`,
  draft: `inttest-slug-hist-old-draft-200km-${SEASON}-04-25`,
  shared: `inttest-slug-hist-old-shared-200km-${SEASON}-05-30`,
  cascade: `inttest-slug-hist-old-cascade-200km-${SEASON}-06-13`,
}

function eventRow(key: keyof typeof IDS, status: string, date: string) {
  return {
    id: IDS[key],
    slug: SLUGS[key],
    name: `Inttest Slug Hist ${key}`,
    chapter_id: TORONTO_CHAPTER_ID,
    event_type: 'brevet',
    distance_km: 200,
    event_date: date,
    status,
  }
}

async function cleanup(): Promise<void> {
  await admin.from('event_slug_history').delete().like('slug', 'inttest-slug-hist-%')
  await admin.from('events').delete().in('id', Object.values(IDS))
  await admin.from('events').delete().like('slug', 'inttest-slug-hist-%')
}

beforeAll(async () => {
  await cleanup()
  await checked(
    admin
      .from('events')
      .insert([
        eventRow('scheduled', 'scheduled', `${SEASON}-05-09`),
        eventRow('draft', 'draft', `${SEASON}-05-02`),
        eventRow('eventA', 'scheduled', `${SEASON}-06-06`),
        eventRow('eventB', 'scheduled', `${SEASON}-06-13`),
        eventRow('cascade', 'scheduled', `${SEASON}-06-20`),
      ]),
    'seed events'
  )
})

afterAll(async () => {
  await cleanup()
})

describe('event_slug_history table', () => {
  it('anon can read a history row joined to a scheduled event', async () => {
    await checked(
      admin.from('event_slug_history').insert({ slug: OLD.scheduled, event_id: IDS.scheduled }),
      'seed history'
    )
    const { data, error } = await anon
      .from('event_slug_history')
      .select('slug, events!inner(slug)')
      .eq('slug', OLD.scheduled)
      .single()
    expect(error).toBeNull()
    const events = data?.events as unknown as { slug: string }
    expect(events.slug).toBe(SLUGS.scheduled)
  })

  it('anon cannot see a history row whose event is a draft', async () => {
    await checked(
      admin.from('event_slug_history').insert({ slug: OLD.draft, event_id: IDS.draft }),
      'seed draft history'
    )
    const { data, error } = await anon
      .from('event_slug_history')
      .select('slug, events!inner(slug)')
      .eq('slug', OLD.draft)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('upsert on the same slug moves it to the newer event', async () => {
    await checked(
      admin
        .from('event_slug_history')
        .upsert({ slug: OLD.shared, event_id: IDS.eventA }, { onConflict: 'slug' }),
      'upsert to A'
    )
    await checked(
      admin
        .from('event_slug_history')
        .upsert({ slug: OLD.shared, event_id: IDS.eventB }, { onConflict: 'slug' }),
      'upsert to B'
    )
    const { data, error } = await admin
      .from('event_slug_history')
      .select('slug, event_id')
      .eq('slug', OLD.shared)
    expect(error).toBeNull()
    expect(data).toEqual([{ slug: OLD.shared, event_id: IDS.eventB }])
  })

  it('deleting the event cascades to its history rows', async () => {
    await checked(
      admin.from('event_slug_history').insert({ slug: OLD.cascade, event_id: IDS.cascade }),
      'seed cascade history'
    )
    await checked(admin.from('events').delete().eq('id', IDS.cascade), 'delete event')
    const { data, error } = await admin
      .from('event_slug_history')
      .select('slug')
      .eq('slug', OLD.cascade)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
