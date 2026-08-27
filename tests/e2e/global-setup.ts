/**
 * Playwright globalSetup — seeds E2E test data into local Supabase.
 *
 * Creates an admin user, route, events, rider, and results so that
 * previously-skipping tests can actually run.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'
import { writeFileSync } from 'fs'
import { join } from 'path'
import WebSocket from 'ws'
import { E2E_IDS, type E2ETestData } from './helpers/test-data'

const TORONTO_CHAPTER_ID = 'ad83d0b9-4d25-472b-9d3e-5732730d761c'
const ADMIN_EMAIL = 'admin@test.com'
const ADMIN_PASSWORD = 'testpassword123'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Run a Supabase query and throw if it returns an error. */
async function checked<T>(
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await operation
  if (error) {
    throw new Error(`[e2e-setup] ${label}: ${error.message}`)
  }
  return data
}

export default async function globalSetup() {
  // Load env files — force development mode so .env.development.local is included
  loadEnvConfig(process.cwd(), true /* development */)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.warn('[e2e-setup] Missing SUPABASE env vars — skipping seed')
    return
  }

  // Newer supabase-js initializes Realtime eagerly. Node 20 (still used by
  // CI) has no native WebSocket, so provide the same test-only transport as
  // the real-database Vitest setup.
  if (typeof globalThis.WebSocket === 'undefined') {
    ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. Admin auth user ──────────────────────────────────────────────
  let adminUserId: string

  const { data: listData } = await supabase.auth.admin.listUsers()
  const existing = (listData?.users as Array<{ id: string; email?: string }> | undefined)?.find(
    (u) => u.email === ADMIN_EMAIL
  )

  if (existing) {
    adminUserId = existing.id
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    })
    if (error || !created.user) {
      throw new Error(`[e2e-setup] Failed to create admin auth user: ${error?.message}`)
    }
    adminUserId = created.user.id
  }

  // Upsert admin record
  await checked(
    supabase.from('admins').upsert(
      {
        id: adminUserId,
        email: ADMIN_EMAIL,
        name: 'E2E Test Admin',
        role: 'super_admin',
      },
      { onConflict: 'id' }
    ),
    'admins upsert'
  )

  // ── 2. Route ────────────────────────────────────────────────────────
  await checked(
    supabase.from('routes').upsert(
      {
        id: E2E_IDS.route,
        slug: 'e2e-test-route',
        name: 'E2E Test Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      },
      { onConflict: 'id' }
    ),
    'routes upsert'
  )

  // ── 3. Events (delete-then-insert to handle date changes) ──────────
  const futureDate = daysFromNow(30)
  const pastDate = daysFromNow(-7)
  const olderDate = daysFromNow(-14)

  const eventIds = [E2E_IDS.scheduledEvent, E2E_IDS.completedEvent, E2E_IDS.submittedEvent]

  // Delete existing test events by ID (cascade: results, registrations first)
  await checked(
    supabase.from('results').delete().in('event_id', eventIds),
    'delete results by event'
  )
  await checked(
    supabase.from('registrations').delete().in('event_id', eventIds),
    'delete registrations by event'
  )
  await checked(supabase.from('events').delete().in('id', eventIds), 'delete events')

  // Scheduled event (future, brevet) — appears on Toronto calendar
  await checked(
    supabase.from('events').insert({
      id: E2E_IDS.scheduledEvent,
      slug: `e2e-test-brevet-200km-${futureDate}`,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: E2E_IDS.route,
      name: 'E2E Test Brevet',
      event_type: 'brevet',
      distance_km: 200,
      event_date: futureDate,
      start_time: '07:00',
      start_location: 'Toronto',
      status: 'scheduled',
    }),
    'insert scheduled event'
  )

  // Completed event (past) — host for pending result
  await checked(
    supabase.from('events').insert({
      id: E2E_IDS.completedEvent,
      slug: `e2e-test-completed-200km-${pastDate}`,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: E2E_IDS.route,
      name: 'E2E Test Completed',
      event_type: 'brevet',
      distance_km: 200,
      event_date: pastDate,
      status: 'completed',
    }),
    'insert completed event'
  )

  // Submitted event (past) — host for already-submitted result
  await checked(
    supabase.from('events').insert({
      id: E2E_IDS.submittedEvent,
      slug: `e2e-test-submitted-200km-${olderDate}`,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: E2E_IDS.route,
      name: 'E2E Test Submitted',
      event_type: 'brevet',
      distance_km: 200,
      event_date: olderDate,
      status: 'submitted',
    }),
    'insert submitted event'
  )

  // ── 4. Rider ────────────────────────────────────────────────────────
  await checked(
    supabase.from('riders').upsert([
      {
        id: E2E_IDS.rider,
        slug: 'e2e-test-rider',
        first_name: 'E2E',
        last_name: 'TestRider',
      },
      {
        id: E2E_IDS.webkitRider,
        slug: 'e2e-test-webkit-rider',
        first_name: 'WebKit',
        last_name: 'TestRider',
      },
    ]),
    'riders upsert'
  )

  // ── 5. Results (delete-then-insert, read back auto-generated tokens)
  await checked(
    supabase.from('results').delete().in('id', [E2E_IDS.pendingResult, E2E_IDS.submittedResult]),
    'delete results by id'
  )

  // Pending result (for result-submission tests)
  await checked(
    supabase.from('results').insert({
      id: E2E_IDS.pendingResult,
      event_id: E2E_IDS.completedEvent,
      rider_id: E2E_IDS.rider,
      status: 'pending',
      season: new Date().getFullYear(),
      distance_km: 200,
    }),
    'insert pending result'
  )

  // Submitted result (for "already submitted" test)
  await checked(
    supabase.from('results').insert({
      id: E2E_IDS.submittedResult,
      event_id: E2E_IDS.submittedEvent,
      rider_id: E2E_IDS.rider,
      status: 'finished',
      finish_time: '10:30:00',
      season: new Date().getFullYear(),
      distance_km: 200,
      submitted_at: new Date().toISOString(),
    }),
    'insert submitted result'
  )

  // Read back the auto-generated submission tokens
  const pendingRow = await checked(
    supabase.from('results').select('submission_token').eq('id', E2E_IDS.pendingResult).single(),
    'read pending submission_token'
  )

  const submittedRow = await checked(
    supabase.from('results').select('submission_token').eq('id', E2E_IDS.submittedResult).single(),
    'read submitted submission_token'
  )

  if (!pendingRow?.submission_token || !submittedRow?.submission_token) {
    throw new Error('[e2e-setup] Submission tokens are null after insert')
  }

  // ── 6. Digital brevet card: in-progress brevet + registration + controls
  const CONTROL_LAT = 43.6453 // Union Station, Toronto
  const CONTROL_LNG = -79.3806

  // Started an hour ago Toronto time, so check-ins are inside the window.
  const nowToronto = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() - 60 * 60 * 1000))
  const tzParts = Object.fromEntries(nowToronto.map((p) => [p.type, p.value]))
  const activeDate = `${tzParts.year}-${tzParts.month}-${tzParts.day}`
  const activeStart = `${tzParts.hour}:${tzParts.minute}`

  await supabase.from('event_controls').delete().eq('event_id', E2E_IDS.activeEvent)
  await supabase.from('registrations').delete().eq('event_id', E2E_IDS.activeEvent)
  await supabase.from('events').delete().eq('id', E2E_IDS.activeEvent)

  await checked(
    supabase.from('events').insert({
      id: E2E_IDS.activeEvent,
      slug: `e2e-test-active-200km-${activeDate}`,
      chapter_id: TORONTO_CHAPTER_ID,
      route_id: E2E_IDS.route,
      name: 'E2E Test Active Brevet',
      event_type: 'brevet',
      distance_km: 200,
      event_date: activeDate,
      start_time: activeStart,
      start_location: 'Toronto',
      status: 'scheduled',
    }),
    'insert active event'
  )

  await checked(
    supabase.from('event_controls').insert([
      {
        id: E2E_IDS.activeControlStart,
        event_id: E2E_IDS.activeEvent,
        position: 1,
        name: 'Start — Union Station',
        distance_km: 0,
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
        radius_m: 500,
      },
      {
        id: E2E_IDS.activeControlFinish,
        event_id: E2E_IDS.activeEvent,
        position: 2,
        name: 'Finish — Union Station',
        distance_km: 200,
        lat: CONTROL_LAT,
        lng: CONTROL_LNG,
        radius_m: 500,
      },
    ]),
    'insert active event controls'
  )

  await checked(
    supabase.from('registrations').insert([
      {
        id: E2E_IDS.activeRegistration,
        event_id: E2E_IDS.activeEvent,
        rider_id: E2E_IDS.rider,
      },
      {
        id: E2E_IDS.webkitActiveRegistration,
        event_id: E2E_IDS.activeEvent,
        rider_id: E2E_IDS.webkitRider,
      },
    ]),
    'insert active registrations'
  )

  const activeRegs = await checked(
    supabase
      .from('registrations')
      .select('id, management_token')
      .in('id', [E2E_IDS.activeRegistration, E2E_IDS.webkitActiveRegistration]),
    'read active management tokens'
  )
  const activeTokenById = new Map(
    (activeRegs as { id: string; management_token: string | null }[]).map((registration) => [
      registration.id,
      registration.management_token,
    ])
  )
  const activeManagementToken = activeTokenById.get(E2E_IDS.activeRegistration)
  const webkitManagementToken = activeTokenById.get(E2E_IDS.webkitActiveRegistration)
  if (!activeManagementToken || !webkitManagementToken) {
    throw new Error('[e2e-setup] Active registration management token is null after insert')
  }

  // ── 7. Write data file for test workers ─────────────────────────────
  const testData: E2ETestData = {
    admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId: adminUserId },
    scheduledEvent: {
      id: E2E_IDS.scheduledEvent,
      slug: `e2e-test-brevet-200km-${futureDate}`,
      date: futureDate,
    },
    completedEvent: { id: E2E_IDS.completedEvent, slug: `e2e-test-completed-200km-${pastDate}` },
    submittedEvent: { id: E2E_IDS.submittedEvent, slug: `e2e-test-submitted-200km-${olderDate}` },
    route: { id: E2E_IDS.route, slug: 'e2e-test-route' },
    rider: { id: E2E_IDS.rider, slug: 'e2e-test-rider' },
    pendingResult: { id: E2E_IDS.pendingResult, submissionToken: pendingRow.submission_token },
    submittedResult: {
      id: E2E_IDS.submittedResult,
      submissionToken: submittedRow.submission_token,
    },
    brevetCard: {
      eventId: E2E_IDS.activeEvent,
      managementToken: activeManagementToken,
      webkitManagementToken,
      controlLat: CONTROL_LAT,
      controlLng: CONTROL_LNG,
    },
  }

  const outPath = join(__dirname, '.e2e-data.json')
  writeFileSync(outPath, JSON.stringify(testData, null, 2))
  console.log('[e2e-setup] Test data seeded successfully')
}
