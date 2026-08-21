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

/** Parse the `?view=` search param; anything other than 'grid' falls back to 'list'. */
export function parseAdminEventsView(view: string | undefined): AdminEventsView {
  return view === 'grid' ? 'grid' : 'list'
}

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

/** Link back to the admin events list from an event detail page, restoring the from_* filter state. */
export function buildBackUrl(
  fromSeason?: string,
  fromChapter?: string,
  fromWhen?: string,
  fromView?: string
): string {
  const params = new URLSearchParams()
  if (fromSeason) params.set('season', fromSeason)
  if (fromChapter) params.set('chapter', fromChapter)
  if (fromWhen) params.set('when', fromWhen)
  if (fromView === 'grid') params.set('view', 'grid')
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}
