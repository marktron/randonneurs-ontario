import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'

/**
 * Capability-token column security.
 *
 * `management_token` (registrations) and `submission_token` (results) are the
 * entire security model for the unauthenticated rider self-service flows
 * (`/registration/manage/[token]`, `/results/submit/[token]`). They must never
 * be readable by the anon role.
 *
 * This suite SEEDS a registration and a result carrying KNOWN token values, then
 * asserts anon cannot read those values. Seeding a known token is essential: an
 * earlier version of this file queried an empty table and derived "protected"
 * from `data === []`, so a regression that re-granted the column to anon would
 * have passed unnoticed on a freshly-reset DB. With a known token present, a
 * grant regression makes the value appear and the test fails.
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

// Fixed UUIDs isolated to this file (season 2099 keeps fixtures out of real data).
const IDS = {
  route: '7c000000-0000-4000-8000-000000000001',
  event: '7c000000-0000-4000-8000-000000000002',
  rider: '7c000000-0000-4000-8000-000000000003',
  registration: '7c000000-0000-4000-8000-000000000004',
  result: '7c000000-0000-4000-8000-000000000005',
}
// Known token values seeded explicitly (the columns are UUID DEFAULT
// gen_random_uuid(); the service role may write them directly). These are the
// positive controls — anon must never be able to read either value.
const KNOWN_MGMT_TOKEN = '7c000000-0000-4000-8000-00000000a001'
const KNOWN_SUB_TOKEN = '7c000000-0000-4000-8000-00000000b001'

const SLUG = 'inttest-toksec-rider'
const EMAIL = 'inttest-toksec@example.com'
const SEASON = 2099

async function cleanup(): Promise<void> {
  await admin.from('results').delete().eq('id', IDS.result)
  await admin.from('registrations').delete().eq('id', IDS.registration)
  await admin.from('events').delete().eq('id', IDS.event)
  await admin.from('routes').delete().eq('id', IDS.route)
  await admin.from('riders').delete().eq('id', IDS.rider)
  await admin.from('riders').delete().eq('slug', SLUG)
  await admin.from('riders').delete().eq('email', EMAIL)
}

beforeAll(async () => {
  await cleanup()

  await checked(
    admin.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-toksec-route',
      chapter_id: TORONTO_CHAPTER_ID,
      name: 'IntTest TokSec Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )

  await checked(
    admin.from('events').insert({
      id: IDS.event,
      slug: 'inttest-toksec-event',
      name: 'IntTest TokSec Event',
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
      first_name: 'TokSec',
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
      management_token: KNOWN_MGMT_TOKEN,
    }),
    'seed registration'
  )

  await checked(
    admin.from('results').insert({
      id: IDS.result,
      event_id: IDS.event,
      rider_id: IDS.rider,
      status: 'finished',
      finish_time: '13:30:00',
      season: SEASON,
      distance_km: 200,
      submission_token: KNOWN_SUB_TOKEN,
    }),
    'seed result'
  )
})

afterAll(async () => {
  await cleanup()
})

describe('capability token column security', () => {
  it('anon cannot read the seeded management_token from the registrations base table', async () => {
    const { data, error } = await anon
      .from('registrations')
      .select('id, management_token')
      .eq('id', IDS.registration)

    // The row exists, so if the column were readable to anon the known token
    // would appear. Protected ⇔ the query errors OR the value never surfaces.
    const leaked = (data ?? []).some(
      (row: Record<string, unknown>) => row.management_token === KNOWN_MGMT_TOKEN
    )
    expect(leaked).toBe(false)
    expect(error !== null || !leaked).toBe(true)
  })

  it('anon cannot read the seeded submission_token from the results table', async () => {
    const { data, error } = await anon
      .from('results')
      .select('id, submission_token')
      .eq('id', IDS.result)

    const leaked = (data ?? []).some(
      (row: Record<string, unknown>) => row.submission_token === KNOWN_SUB_TOKEN
    )
    expect(leaked).toBe(false)
    expect(error !== null || !leaked).toBe(true)
  })

  it('admin (service role) still reads the exact management_token', async () => {
    const { data, error } = await admin
      .from('registrations')
      .select('management_token')
      .eq('id', IDS.registration)
      .single()

    expect(error).toBeNull()
    expect((data as { management_token: string }).management_token).toBe(KNOWN_MGMT_TOKEN)
  })

  it('admin (service role) still reads the exact submission_token', async () => {
    const { data, error } = await admin
      .from('results')
      .select('submission_token')
      .eq('id', IDS.result)
      .single()

    expect(error).toBeNull()
    expect((data as { submission_token: string }).submission_token).toBe(KNOWN_SUB_TOKEN)
  })

  it('anon reads the seeded registration via public_registrations WITHOUT the token column', async () => {
    const { data, error } = await anon
      .from('public_registrations')
      .select('*')
      .eq('id', IDS.registration)

    expect(error).toBeNull()
    expect(data).toHaveLength(1) // the row is genuinely visible via the view…
    expect(data![0]).not.toHaveProperty('management_token') // …but the token is not in it
    expect((data![0] as { status: string }).status).toBe('registered')
  })

  it('anon reads the seeded result non-token columns but not submission_token', async () => {
    const { data, error } = await anon
      .from('results')
      .select('id, event_id, status, finish_time')
      .eq('id', IDS.result)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).not.toHaveProperty('submission_token')
    expect((data![0] as { status: string }).status).toBe('finished')
  })
})
