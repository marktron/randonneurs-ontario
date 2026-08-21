/**
 * URL builders for the admin events list.
 *
 * Pure and dependency-free so both the server page and the client-side grid
 * wrapper can build the same links — a function prop cannot cross the RSC
 * boundary, so the client component builds its own hrefs from serializable
 * filter values.
 */

import { getCurrentSeasonLabel } from '@/lib/season'
import type { DateFilter, AdminEventsView } from '@/components/admin/event-filters'

const currentSeason = getCurrentSeasonLabel()

/** Link to an event's admin detail page, preserving the list's filter state. */
export function buildEventDetailUrl(
  eventId: string,
  season: string,
  chapterId: string | null,
  dateFilter: DateFilter,
  view: AdminEventsView
): string {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('from_season', season)
  if (chapterId) params.set('from_chapter', chapterId)
  if (dateFilter !== 'all') params.set('from_when', dateFilter)
  if (view !== 'list') params.set('from_view', view)
  const qs = params.toString()
  return `/admin/events/${eventId}${qs ? `?${qs}` : ''}`
}

/** Link to a page of the admin events list, preserving the filter state. */
export function buildPageUrl(
  page: number,
  season: string,
  chapterParam: string | undefined,
  dateFilter: DateFilter,
  view: AdminEventsView
): string {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('season', season)
  if (chapterParam) params.set('chapter', chapterParam)
  if (dateFilter !== 'all') params.set('when', dateFilter)
  if (page > 1) params.set('page', String(page))
  if (view !== 'list') params.set('view', view)
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}
