/**
 * Playwright globalTeardown — removes E2E test data from local Supabase.
 *
 * Deletes in reverse dependency order to respect foreign keys.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'
import { unlinkSync } from 'fs'
import { join } from 'path'
import WebSocket from 'ws'
import { E2E_IDS } from './helpers/test-data'

export default async function globalTeardown() {
  loadEnvConfig(process.cwd(), true /* development */)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  if (typeof globalThis.WebSocket === 'undefined') {
    ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const eventIds = [
    E2E_IDS.scheduledEvent,
    E2E_IDS.completedEvent,
    E2E_IDS.submittedEvent,
    E2E_IDS.activeEvent,
  ]

  // Digital brevet card data (check-ins/controls cascade from events, but
  // delete explicitly so interrupted runs can't leave orphans)
  await supabase
    .from('control_checkins')
    .delete()
    .in('registration_id', [E2E_IDS.activeRegistration, E2E_IDS.webkitActiveRegistration])
  await supabase.from('event_controls').delete().eq('event_id', E2E_IDS.activeEvent)

  // Results
  await supabase.from('results').delete().in('id', [E2E_IDS.pendingResult, E2E_IDS.submittedResult])

  // Registrations created during tests
  await supabase.from('registrations').delete().in('event_id', eventIds)

  // Events
  await supabase.from('events').delete().in('id', eventIds)

  // Route
  await supabase.from('routes').delete().eq('id', E2E_IDS.route)

  // Rider
  await supabase.from('riders').delete().in('id', [E2E_IDS.rider, E2E_IDS.webkitRider])

  // News items created during admin tests
  await supabase.from('news').delete().ilike('title', 'Test Announcement%')

  // Admin record + auth user
  const { data: adminRow } = await supabase
    .from('admins')
    .select('id')
    .eq('email', 'admin@test.com')
    .single()

  if (adminRow) {
    await supabase.from('admins').delete().eq('id', adminRow.id)
    await supabase.auth.admin.deleteUser(adminRow.id)
  }

  // Clean up data file
  try {
    unlinkSync(join(__dirname, '.e2e-data.json'))
  } catch {
    // Already gone — fine
  }

  console.log('[e2e-teardown] Test data cleaned up')
}
