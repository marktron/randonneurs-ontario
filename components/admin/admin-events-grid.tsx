'use client'

import { CalendarGridView } from '@/components/calendar-grid-view'
import { buildEventDetailUrl } from '@/lib/admin/event-list-urls'
import type { Event } from '@/components/event-card'
import type { DateFilter, AdminEventsView } from '@/components/admin/event-filters'

interface AdminEventsGridProps {
  /** Already mapped to the public grid shape by `mapEventForGrid`. */
  events: Event[]
  season: string
  chapterId: string | null
  dateFilter: DateFilter
  view: AdminEventsView
}

/**
 * Client wrapper around `CalendarGridView` for the admin events list.
 *
 * `CalendarGridView` is a client component, so the server page cannot hand it
 * an `hrefFor` function. It passes the serializable filter values instead and
 * this wrapper builds the links on the client.
 */
export function AdminEventsGrid({
  events,
  season,
  chapterId,
  dateFilter,
  view,
}: AdminEventsGridProps) {
  return (
    <CalendarGridView
      events={events}
      hrefFor={(event) => buildEventDetailUrl(event.id ?? '', season, chapterId, dateFilter, view)}
    />
  )
}
