import { getSupabaseAdmin } from '@/lib/supabase-server'
import { createErwEvent } from '@/lib/erw/client'
import { isErwSyncEnabled } from '@/lib/erw/config'

/** The event columns the ERW create call needs. Matches the `events` row names. */
export interface ErwSyncableEvent {
  id: string
  name: string
  description: string | null
  distance_km: number
  event_date: string
  start_time: string | null
  slug: string
  route_id: string | null
  event_type: string
}

export type ErwSyncOutcome = 'synced' | 'skipped' | 'failed'

/**
 * Create the Epic Ride Weather event for a newly published (non-permanent)
 * event and store the returned ids on the row.
 *
 * Called from createEvent (status scheduled), updateEventStatus (draft ->
 * scheduled) and publishSeasonDrafts. Skips permanents and non-production
 * environments; a failed ERW call never fails the caller.
 */
export async function syncNewEventToErw(event: ErwSyncableEvent): Promise<ErwSyncOutcome> {
  if (event.event_type === 'permanent' || !isErwSyncEnabled()) {
    return 'skipped'
  }

  let rwgpsId: string | null = null
  if (event.route_id) {
    const { data: route } = await getSupabaseAdmin()
      .from('routes')
      .select('rwgps_id')
      .eq('id', event.route_id)
      .single()
    rwgpsId = route?.rwgps_id ?? null
  }

  const erwResult = await createErwEvent({
    name: event.name,
    description: event.description || '',
    distanceKm: event.distance_km,
    eventDate: event.event_date,
    startTime: event.start_time || null,
    slug: event.slug,
    rwgpsId,
  })

  if (!erwResult.success || !erwResult.data) {
    return 'failed'
  }

  await getSupabaseAdmin()
    .from('events')
    .update({
      erw_event_id: erwResult.data.erwEventId,
      erw_canonical_url: erwResult.data.canonicalUrl,
    })
    .eq('id', event.id)

  return 'synced'
}
