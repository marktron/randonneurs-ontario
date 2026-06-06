/**
 * Shared rider-count helper for admin views.
 *
 * Returns the number of ACTIVE riders per event, deduplicated across
 * registrations and results. "Active" means a registration whose status is
 * 'registered' or 'incomplete: membership' — cancelled registrations are
 * excluded. A rider who both registered and has a result is counted once.
 *
 * This is the single source of truth for the counts shown on the admin
 * dashboard (`/admin`) and the admin events list (`/admin/events`). Both
 * surfaces previously had their own counting logic, which drifted: the
 * dashboard summed cancelled registrations into the total. Routing every
 * admin count through the `get_event_rider_counts` RPC keeps them consistent.
 *
 * Uses the admin client (service role) because these counts are only shown in
 * the admin area; callers are already gated by `requireAdmin()`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'

export async function getEventRiderCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {}

  const { data } = await getSupabaseAdmin().rpc('get_event_rider_counts', {
    event_ids: eventIds,
  })

  // Default every requested event to 0; the RPC omits events with no riders.
  const counts: Record<string, number> = {}
  for (const id of eventIds) counts[id] = 0

  for (const row of (data as Array<{ event_id: string; rider_count: number }> | null) ?? []) {
    counts[row.event_id] = Number(row.rider_count)
  }

  return counts
}
