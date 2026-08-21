import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'
import { getEventBySlug } from '@/lib/data/events'

// Draft events must be invisible to the anon role (the public site) and
// rejected values must still be rejected by the CHECK constraint.

const admin = getTestSupabase() // service role — bypasses RLS

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

const SEASON = 2099 // far-future season isolates fixtures from real data
const IDS = {
  draftEvent: '00000000-2222-4000-a000-00000000d001',
  scheduledEvent: '00000000-2222-4000-a000-00000000d002',
}
const SLUGS = {
  draft: `inttest-draft-event-200km-${SEASON}-05-02`,
  scheduled: `inttest-scheduled-event-200km-${SEASON}-05-09`,
}

async function cleanup(): Promise<void> {
  await admin.from('events').delete().in('id', [IDS.draftEvent, IDS.scheduledEvent])
  await admin.from('events').delete().in('slug', [SLUGS.draft, SLUGS.scheduled])
}

beforeAll(async () => {
  await cleanup()
  await checked(
    admin.from('events').insert([
      {
        id: IDS.draftEvent,
        slug: SLUGS.draft,
        name: 'Inttest Draft Event',
        chapter_id: TORONTO_CHAPTER_ID,
        event_type: 'brevet',
        distance_km: 200,
        event_date: `${SEASON}-05-02`,
        status: 'draft',
      },
      {
        id: IDS.scheduledEvent,
        slug: SLUGS.scheduled,
        name: 'Inttest Scheduled Event',
        chapter_id: TORONTO_CHAPTER_ID,
        event_type: 'brevet',
        distance_km: 200,
        event_date: `${SEASON}-05-09`,
        status: 'scheduled',
      },
    ]),
    'seed draft + scheduled events'
  )
})

afterAll(async () => {
  await cleanup()
})

describe('events_status_check', () => {
  it('accepts draft and still rejects unknown values', async () => {
    const { error } = await admin
      .from('events')
      .update({ status: 'bogus' })
      .eq('id', IDS.draftEvent)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514') // check_violation
  })
})

describe('events_select_public RLS', () => {
  it('hides draft events from the anon role but shows scheduled ones', async () => {
    const { data, error } = await anon
      .from('events')
      .select('id, status')
      .in('id', [IDS.draftEvent, IDS.scheduledEvent])
    expect(error).toBeNull()
    const ids = (data ?? []).map((r) => r.id)
    expect(ids).toContain(IDS.scheduledEvent)
    expect(ids).not.toContain(IDS.draftEvent)
  })

  it('service role still sees drafts', async () => {
    const { data } = await admin.from('events').select('id').eq('id', IDS.draftEvent).single()
    expect(data?.id).toBe(IDS.draftEvent)
  })
})

describe('getEventBySlug', () => {
  it('returns null for a draft and the event for a scheduled one', async () => {
    expect(await getEventBySlug(SLUGS.draft)).toBeNull()
    const scheduled = await getEventBySlug(SLUGS.scheduled)
    expect(scheduled?.slug).toBe(SLUGS.scheduled)
  })
})
