import type { Event } from '@/components/event-card'
import type { EventForAdminList } from '@/types/queries'

const TYPE_LABELS: Record<string, Event['type']> = {
  brevet: 'Brevet',
  populaire: 'Populaire',
  fleche: 'Fleche',
  permanent: 'Permanent',
}

/**
 * Adapt an admin list row to the public `Event` shape the calendar grid
 * renders. The grid only reads date/name/distance/status/chapterName/time;
 * start_location is not selected by the admin list, so it is blank. `slug`
 * is unused when an `hrefFor` is supplied, so the id stands in for it.
 */
export function mapEventForGrid(event: EventForAdminList): Event {
  const status: Event['status'] =
    event.status === 'draft' || event.status === 'cancelled' ? event.status : 'scheduled'
  return {
    id: event.id,
    slug: event.id,
    date: event.event_date,
    name: event.name,
    type: TYPE_LABELS[event.event_type] ?? 'Brevet',
    distance: String(event.distance_km),
    startLocation: '',
    startTime: event.start_time?.slice(0, 5) ?? '00:00',
    status,
    chapterName: event.chapters?.name ?? undefined,
  }
}
