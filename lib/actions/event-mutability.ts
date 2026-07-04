/**
 * Shared guard for admin mutations tied to an event's lifecycle. Not a
 * `'use server'` module — it is a plain helper (like
 * lib/actions/registration/helpers.ts) so importing it never exposes a
 * public server-action endpoint.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'

/**
 * Once an event's results are submitted, its check-ins (and the controls
 * they hang off) are frozen. Every admin write that could create, change,
 * or cascade-delete check-ins must pass this gate first.
 */
export async function assertEventMutable(
  eventId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin()
  const { data: event, error } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .single()

  if (error || !event) {
    return { ok: false, error: 'Event not found' }
  }
  if ((event as { status: string | null }).status === 'submitted') {
    return { ok: false, error: 'Results for this event have been submitted; check-ins are frozen' }
  }
  return { ok: true }
}
