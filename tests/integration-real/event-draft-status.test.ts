import { vi } from 'vitest'

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: '00000000-2222-4000-a000-00000000a0a0',
    email: 'inttest-super@example.com',
    name: 'Inttest Super',
    role: 'super_admin',
    chapter_id: null,
    phone: null,
    created_at: null,
    updated_at: null,
  }),
  getAdmin: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: vi.fn(async () => {}) }))

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'
import { getEventBySlug } from '@/lib/data/events'
import { publishSeasonDrafts } from '@/lib/actions/events'

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
  otherSeasonDraft: '00000000-2222-4000-a000-00000000d003',
  nullStatusEvent: '00000000-2222-4000-a000-00000000d004',
}
const SLUGS = {
  draft: `inttest-draft-event-200km-${SEASON}-05-02`,
  scheduled: `inttest-scheduled-event-200km-${SEASON}-05-09`,
  otherSeasonDraft: `inttest-other-draft-200km-${SEASON - 1}-05-02`,
  nullStatus: `inttest-null-status-200km-${SEASON}-05-16`,
}

async function cleanup(): Promise<void> {
  await admin
    .from('events')
    .delete()
    .in('id', [IDS.draftEvent, IDS.scheduledEvent, IDS.otherSeasonDraft, IDS.nullStatusEvent])
  await admin
    .from('events')
    .delete()
    .in('slug', [SLUGS.draft, SLUGS.scheduled, SLUGS.otherSeasonDraft, SLUGS.nullStatus])
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
      {
        id: IDS.otherSeasonDraft,
        slug: SLUGS.otherSeasonDraft,
        name: 'Inttest Other Draft Event',
        chapter_id: TORONTO_CHAPTER_ID,
        event_type: 'brevet',
        distance_km: 200,
        event_date: `${SEASON - 1}-05-02`,
        status: 'draft',
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

describe('events.status NOT NULL', () => {
  it('rejects inserting an event with status: null', async () => {
    const { error } = await admin.from('events').insert({
      id: IDS.nullStatusEvent,
      slug: SLUGS.nullStatus,
      name: 'Inttest Null Status Event',
      chapter_id: TORONTO_CHAPTER_ID,
      event_type: 'brevet',
      distance_km: 200,
      event_date: `${SEASON}-05-16`,
      status: null,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23502') // not_null_violation
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

// This describe mutates IDS.draftEvent's status, so it must stay last in the
// file (Vitest runs describes in file order).
describe('publishSeasonDrafts', () => {
  it('publishes drafts of the given season only, and the anon role can then read them', async () => {
    const result = await publishSeasonDrafts(SEASON)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.published).toBe(1)
    }

    const { data: rows } = await admin
      .from('events')
      .select('id, status')
      .in('id', [IDS.draftEvent, IDS.scheduledEvent, IDS.otherSeasonDraft])
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r.status]))
    expect(byId[IDS.draftEvent]).toBe('scheduled')
    expect(byId[IDS.scheduledEvent]).toBe('scheduled')
    expect(byId[IDS.otherSeasonDraft]).toBe('draft')

    const { data: anonRows } = await anon.from('events').select('id').eq('id', IDS.draftEvent)
    expect(anonRows?.map((r) => r.id)).toEqual([IDS.draftEvent])
  })
})
