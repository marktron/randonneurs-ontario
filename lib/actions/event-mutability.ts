/**
 * Shared guard for admin mutations tied to an event's lifecycle. Not a
 * `'use server'` module — it is a plain helper (like
 * lib/actions/registration/helpers.ts) so importing it never exposes a
 * public server-action endpoint.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'

// The lifecycle table lives in a pure module so client components can import
// it without pulling in the admin Supabase client; server code reads it here.
export { EVENT_STATUS_TRANSITIONS, canTransitionEvent } from '@/lib/events/status'

/**
 * Once an event's results are submitted, the event is frozen: its details,
 * results, check-ins and controls. Every admin write that could create,
 * change, or cascade-delete any of them must pass this gate first.
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
    return { ok: false, error: 'Results for this event have been submitted; it is frozen' }
  }
  return { ok: true }
}
