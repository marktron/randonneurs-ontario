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

import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'
import { updateEvent } from '@/lib/actions/events'
import { getEventSlugRedirect } from '@/lib/data/events'

const admin = getTestSupabase() // service role

const ID = '00000000-2222-4000-a000-00000000e101'
const SLUG_A = 'inttest-slug-rot-200km-2099-05-02'
const SLUG_B = 'inttest-slug-rot-200km-2099-05-09'

async function cleanup(): Promise<void> {
  await admin.from('event_slug_history').delete().eq('event_id', ID)
  await admin.from('event_slug_history').delete().like('slug', 'inttest-slug-rot-%')
  await admin.from('events').delete().eq('id', ID)
  await admin.from('events').delete().like('slug', 'inttest-slug-rot-%')
}

async function currentSlug(): Promise<string> {
  const { data } = await admin.from('events').select('slug').eq('id', ID).single()
  return data!.slug
}

async function historyFor(slug: string) {
  const { data } = await admin.from('event_slug_history').select('slug, event_id').eq('slug', slug)
  return data ?? []
}

beforeEach(async () => {
  await cleanup()
  await checked(
    admin.from('events').insert({
      id: ID,
      slug: SLUG_A,
      name: 'Inttest Slug Rot',
      chapter_id: TORONTO_CHAPTER_ID,
      event_type: 'brevet',
      distance_km: 200,
      event_date: '2099-05-02',
      status: 'scheduled',
      collection: null,
      description: null,
      direction: 'as_posted',
      route_id: null,
      start_time: null,
      start_location: null,
      image_url: null,
    }),
    'insert slug rotation fixture'
  )
})

afterAll(async () => {
  await cleanup()
})

describe('updateEvent slug rotation (real DB)', () => {
  it('rescheduling rotates the slug and leaves a redirect', async () => {
    const result = await updateEvent(ID, {
      name: 'Inttest Slug Rot',
      distanceKm: 200,
      eventDate: '2099-05-09',
    })
    expect(result.success).toBe(true)
    expect(await currentSlug()).toBe(SLUG_B)
    expect(await historyFor(SLUG_A)).toEqual([{ slug: SLUG_A, event_id: ID }])
    expect(await historyFor(SLUG_B)).toEqual([])
  })

  it('reverting the date removes the history row for the now-live slug', async () => {
    // Seed the post-reschedule state: live slug B, redirect row for A.
    await checked(
      admin.from('events').update({ slug: SLUG_B, event_date: '2099-05-09' }).eq('id', ID).select(),
      'seed rescheduled event'
    )
    await checked(
      admin.from('event_slug_history').insert({ slug: SLUG_A, event_id: ID }).select(),
      'seed history row'
    )

    const result = await updateEvent(ID, {
      name: 'Inttest Slug Rot',
      distanceKm: 200,
      eventDate: '2099-05-02',
    })
    expect(result.success).toBe(true)
    expect(await currentSlug()).toBe(SLUG_A)
    expect(await historyFor(SLUG_B)).toEqual([{ slug: SLUG_B, event_id: ID }])
    expect(await historyFor(SLUG_A)).toEqual([])
  })
})

describe('getEventSlugRedirect (real DB)', () => {
  // .env.local sets SHOW_DRAFT_EVENTS=true; each test pins the flag itself.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves an old slug to the current one and unknown slugs to null', async () => {
    await checked(
      admin.from('events').update({ slug: SLUG_B, event_date: '2099-05-09' }).eq('id', ID).select(),
      'seed rescheduled event'
    )
    await checked(
      admin.from('event_slug_history').insert({ slug: SLUG_A, event_id: ID }).select(),
      'seed history row'
    )

    vi.stubEnv('SHOW_DRAFT_EVENTS', undefined)
    expect(await getEventSlugRedirect(SLUG_A)).toBe(SLUG_B)
    expect(await getEventSlugRedirect('inttest-slug-rot-nope')).toBeNull()
  })

  it('returns null when the event behind the old slug is a draft (RLS)', async () => {
    await checked(
      admin
        .from('events')
        .update({ slug: SLUG_B, event_date: '2099-05-09', status: 'draft' })
        .eq('id', ID)
        .select(),
      'seed draft event'
    )
    await checked(
      admin.from('event_slug_history').insert({ slug: SLUG_A, event_id: ID }).select(),
      'seed history row'
    )

    vi.stubEnv('SHOW_DRAFT_EVENTS', undefined)
    expect(await getEventSlugRedirect(SLUG_A)).toBeNull()

    vi.stubEnv('SHOW_DRAFT_EVENTS', 'true')
    expect(await getEventSlugRedirect(SLUG_A)).toBe(SLUG_B)
  })
})
