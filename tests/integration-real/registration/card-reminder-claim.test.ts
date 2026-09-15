import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './helpers'
import { fetchCardReminderCandidates } from '@/lib/events/send-card-reminders'
import type { CardReminderCandidateRow } from '@/lib/events/send-card-reminders'

/**
 * `registrations.card_reminder_sent_at` is the send-once claim column for
 * the digital brevet card reminder email (sent ~12h before a rider's
 * start — see docs/digital-brevet-card.md §11). NULL = not yet sent. A
 * later cron sweep claims a row atomically with:
 *   UPDATE ... SET card_reminder_sent_at = now() WHERE id = ? AND
 *   card_reminder_sent_at IS NULL
 * so overlapping cron runs can never double-email a rider. This suite
 * proves the conditional claim actually behaves that way against a real
 * Postgres row (the mock suite can't catch a `.is()` filter regression),
 * that the column defaults to NULL, and that it stays hidden from anon
 * via `public_registrations` the same way other non-public columns do.
 */

/** Anon client — uses the public anon key, no elevated privileges. */
function getAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const admin = getTestSupabase()
const anon = getAnonSupabase()

const IDS = {
  route: '7d000000-0000-4000-8000-000000000001',
  event: '7d000000-0000-4000-8000-000000000002',
  rider: '7d000000-0000-4000-8000-000000000003',
  registration: '7d000000-0000-4000-8000-000000000004',
  paperRider: '7d000000-0000-4000-8000-000000000005',
  paperRegistration: '7d000000-0000-4000-8000-000000000006',
  draftEvent: '7d000000-0000-4000-8000-000000000007',
  draftRegistration: '7d000000-0000-4000-8000-000000000008',
  control: '7d000000-0000-4000-8000-000000000009',
}

const SLUG = 'inttest-cardremind-rider'
const ROUTE_SLUG = 'inttest-cardremind-route'
const EVENT_SLUG = 'inttest-cardremind-event'
const EVENT_NAME = 'IntTest CardRemind Event'
const EMAIL = 'inttest-cardremind@example.com'
const PAPER_SLUG = 'inttest-cardremind-paper-rider'
const PAPER_EMAIL = 'inttest-cardremind-paper@example.com'
const DRAFT_EVENT_SLUG = 'inttest-cardremind-draft-event'
const DRAFT_EVENT_NAME = 'IntTest CardRemind Draft Event'

async function cleanup(): Promise<void> {
  // Clean up by every natural key, not just id, so a partial prior run
  // (or a re-run of this suite) can never leave duplicates behind.
  await admin
    .from('registrations')
    .delete()
    .in('id', [IDS.registration, IDS.paperRegistration, IDS.draftRegistration])
  await admin.from('registrations').delete().in('event_id', [IDS.event, IDS.draftEvent])
  await admin.from('event_controls').delete().eq('id', IDS.control)
  await admin.from('event_controls').delete().in('event_id', [IDS.event, IDS.draftEvent])
  await admin.from('events').delete().in('id', [IDS.event, IDS.draftEvent])
  await admin.from('events').delete().in('slug', [EVENT_SLUG, DRAFT_EVENT_SLUG])
  await admin.from('events').delete().in('name', [EVENT_NAME, DRAFT_EVENT_NAME])
  await admin.from('routes').delete().eq('id', IDS.route)
  await admin.from('routes').delete().eq('slug', ROUTE_SLUG)
  await admin.from('riders').delete().in('id', [IDS.rider, IDS.paperRider])
  await admin.from('riders').delete().in('slug', [SLUG, PAPER_SLUG])
  await admin.from('riders').delete().in('email', [EMAIL, PAPER_EMAIL])
}

beforeEach(async () => {
  await cleanup()

  await checked(
    admin.from('routes').insert({
      id: IDS.route,
      slug: ROUTE_SLUG,
      chapter_id: TORONTO_CHAPTER_ID,
      name: 'IntTest CardRemind Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )

  // Both events get every key explicitly: a mixed-key bulk insert sends the
  // missing ones as NULL and bypasses column defaults.
  await checked(
    admin.from('events').insert([
      {
        id: IDS.event,
        slug: EVENT_SLUG,
        name: EVENT_NAME,
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: daysFromNow(30),
        status: 'scheduled',
      },
      {
        // A draft event is invisible to riders, so its registrations must never
        // be reminded.
        id: IDS.draftEvent,
        slug: DRAFT_EVENT_SLUG,
        name: DRAFT_EVENT_NAME,
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: daysFromNow(30),
        status: 'draft',
      },
    ]),
    'seed events'
  )

  await checked(
    admin.from('event_controls').insert({
      id: IDS.control,
      event_id: IDS.event,
      position: 1,
      name: 'Start — IntTest',
      distance_km: 0,
      radius_m: 500,
    }),
    'seed event control'
  )

  await checked(
    admin.from('riders').insert([
      {
        id: IDS.rider,
        slug: SLUG,
        first_name: 'CardRemind',
        last_name: 'Rider',
        email: EMAIL,
      },
      {
        id: IDS.paperRider,
        slug: PAPER_SLUG,
        first_name: 'CardRemindPaper',
        last_name: 'Rider',
        email: PAPER_EMAIL,
      },
    ]),
    'seed riders'
  )

  await checked(
    admin.from('registrations').insert([
      {
        id: IDS.registration,
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'registered',
        share_registration: true,
        brevet_card_type: 'digital',
      },
      {
        // Sibling on the same event that asked for a paper card.
        id: IDS.paperRegistration,
        event_id: IDS.event,
        rider_id: IDS.paperRider,
        status: 'registered',
        share_registration: true,
        brevet_card_type: 'paper',
      },
      {
        id: IDS.draftRegistration,
        event_id: IDS.draftEvent,
        rider_id: IDS.paperRider,
        status: 'registered',
        share_registration: true,
        brevet_card_type: 'digital',
      },
    ]),
    'seed registrations'
  )
})

afterEach(async () => {
  await cleanup()
})

describe('registrations.card_reminder_sent_at claim', () => {
  it('defaults to NULL on insert', async () => {
    const { data, error } = await admin
      .from('registrations')
      .select('card_reminder_sent_at')
      .eq('id', IDS.registration)
      .single()

    expect(error).toBeNull()
    expect((data as { card_reminder_sent_at: string | null }).card_reminder_sent_at).toBeNull()
  })

  it('first conditional claim succeeds, second identical claim finds no unclaimed row', async () => {
    const claimedAt = new Date().toISOString()

    const first = await admin
      .from('registrations')
      .update({ card_reminder_sent_at: claimedAt })
      .eq('id', IDS.registration)
      .is('card_reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    expect(first.error).toBeNull()
    expect(first.data?.id).toBe(IDS.registration)

    // Overlapping cron run: the row is no longer unclaimed, so the same
    // conditional update matches nothing.
    const second = await admin
      .from('registrations')
      .update({ card_reminder_sent_at: new Date().toISOString() })
      .eq('id', IDS.registration)
      .is('card_reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    expect(second.error).toBeNull()
    expect(second.data).toBeNull()

    // The timestamp from the first (winning) claim must survive untouched.
    // Postgres round-trips timestamptz with a "+00:00" offset rather than
    // the "Z" suffix we sent, so compare instants, not raw strings.
    const { data: reg } = await admin
      .from('registrations')
      .select('card_reminder_sent_at')
      .eq('id', IDS.registration)
      .single()
    expect(new Date(reg?.card_reminder_sent_at as string).getTime()).toBe(
      new Date(claimedAt).getTime()
    )
  })

  it('the sweep candidate query returns the digital rider with rider and event embeds', async () => {
    // The mock suite can't catch a bad embed or a mis-spelled embedded filter,
    // so the real query runs here against real rows.
    const { data, error } = await fetchCardReminderCandidates(admin, daysFromNow(-1))

    expect(error).toBeNull()
    const rows = (data ?? []) as unknown as CardReminderCandidateRow[]
    const row = rows.find((candidate) => candidate.id === IDS.registration)
    expect(row).toBeDefined()

    // PostgREST returns a to-one embed as an object; an array here means the
    // relationship was resolved as to-many and every downstream field read
    // (`riders.email`, `events.event_date`) would be undefined.
    expect(Array.isArray(row!.riders)).toBe(false)
    expect(row!.riders?.email).toBe(EMAIL)
    expect(Array.isArray(row!.events)).toBe(false)
    expect(row!.events.id).toBe(IDS.event)
    expect(row!.events.event_date).toBe(daysFromNow(30))
    expect(row!.events.status).toBe('scheduled')
    expect(row!.management_token).toBeTruthy()

    // The chapter name and slug drive the email's sign-off and reply-to.
    expect(Array.isArray(row!.events.chapters)).toBe(false)
    expect(row!.events.chapters).not.toBeNull()
    expect(row!.events.chapters?.name).toBeTruthy()
    expect(row!.events.chapters?.slug).toBeTruthy()

    const returnedIds = rows.map((candidate) => candidate.id)
    // Paper card: never reminded, even on the same event.
    expect(returnedIds).not.toContain(IDS.paperRegistration)
    // Digital card on a draft event: dropped by the `events!inner` status filter.
    expect(returnedIds).not.toContain(IDS.draftRegistration)
  })

  it('the candidate returned by the sweep query has controls saved, so it is really sendable', async () => {
    // The sweep skips an event with no controls, so this fixture would be a
    // false-positive candidate without the seeded control row.
    const { data, error } = await admin
      .from('event_controls')
      .select('event_id')
      .eq('event_id', IDS.event)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('anon cannot select card_reminder_sent_at from public_registrations', async () => {
    const { data, error } = await anon
      .from('public_registrations')
      .select('*')
      .eq('id', IDS.registration)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).not.toHaveProperty('card_reminder_sent_at')
  })
})
