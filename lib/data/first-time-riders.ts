import { getSupabaseAdmin } from '@/lib/supabase-server'

/**
 * A rider is "first-time" for an event if they have no result from any other
 * event with a status other than DNS — i.e. they have never shown up before.
 * DNF, OTL, DQ, finished and pending all count as having shown up.
 */
export async function getFirstTimeRiderIds(eventId: string, riderIds: string[]): Promise<string[]> {
  if (riderIds.length === 0) return []

  const { data } = await getSupabaseAdmin()
    .from('results')
    .select('rider_id')
    .in('rider_id', riderIds)
    .neq('event_id', eventId)
    .neq('status', 'dns')

  const experienced = new Set((data ?? []).map((r) => r.rider_id))
  return riderIds.filter((id) => !experienced.has(id))
}
