import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './helpers'

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
}

const SLUG = 'inttest-cardremind-rider'
const ROUTE_SLUG = 'inttest-cardremind-route'
const EVENT_SLUG = 'inttest-cardremind-event'
const EVENT_NAME = 'IntTest CardRemind Event'
const EMAIL = 'inttest-cardremind@example.com'

async function cleanup(): Promise<void> {
  // Clean up by every natural key, not just id, so a partial prior run
  // (or a re-run of this suite) can never leave duplicates behind.
  await admin.from('registrations').delete().eq('id', IDS.registration)
  await admin.from('registrations').delete().eq('event_id', IDS.event)
  await admin.from('events').delete().eq('id', IDS.event)
  await admin.from('events').delete().eq('slug', EVENT_SLUG)
  await admin.from('events').delete().eq('name', EVENT_NAME)
  await admin.from('routes').delete().eq('id', IDS.route)
  await admin.from('routes').delete().eq('slug', ROUTE_SLUG)
  await admin.from('riders').delete().eq('id', IDS.rider)
  await admin.from('riders').delete().eq('slug', SLUG)
  await admin.from('riders').delete().eq('email', EMAIL)
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

  await checked(
    admin.from('events').insert({
      id: IDS.event,
      slug: EVENT_SLUG,
      name: EVENT_NAME,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: 200,
      event_date: daysFromNow(30),
      status: 'scheduled',
    }),
    'seed event'
  )

  await checked(
    admin.from('riders').insert({
      id: IDS.rider,
      slug: SLUG,
      first_name: 'CardRemind',
      last_name: 'Rider',
      email: EMAIL,
    }),
    'seed rider'
  )

  await checked(
    admin.from('registrations').insert({
      id: IDS.registration,
      event_id: IDS.event,
      rider_id: IDS.rider,
      status: 'registered',
      share_registration: true,
    }),
    'seed registration'
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
