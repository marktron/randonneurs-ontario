import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'
import WebSocket from 'ws'

/**
 * Delete every check-in for one registration.
 *
 * globalSetup runs once per Playwright invocation, so DB state survives a
 * retry. Without this, a mutation test's second and third attempts start
 * from whatever the failed attempts committed — and can pass vacuously.
 */
export async function resetCheckinsForRegistration(registrationId: string): Promise<void> {
  loadEnvConfig(process.cwd(), true /* development */)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('[e2e] Missing SUPABASE env vars — cannot reset check-ins')
  }
  if (typeof globalThis.WebSocket === 'undefined') {
    ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await supabase
    .from('control_checkins')
    .delete()
    .eq('registration_id', registrationId)
  if (error) throw new Error(`[e2e] reset check-ins: ${error.message}`)
}
