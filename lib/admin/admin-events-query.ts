/**
 * Query builder for the admin events list.
 *
 * Extracted from `app/admin/events/page.tsx` so the pagination behaviour
 * (skip `.range()` and the count query when `pageSize` is null, e.g. the
 * unpaginated grid view) can be unit-tested against a mocked Supabase
 * client instead of only through the page's rendered output.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEventRiderCounts } from '@/lib/data/event-rider-counts'
import type { DateFilter } from '@/components/admin/event-filters'
import type { EventForAdminList } from '@/types/queries'
import type { Database } from '@/types/supabase'

export async function getAdminEvents(
  supabase: SupabaseClient<Database>,
  season: string,
  dateFilter: DateFilter,
  chapterId?: string,
  chapterSlug?: string,
  page: number = 1,
  pageSize: number | null = null
): Promise<{ events: EventForAdminList[]; totalCount: number }> {
  const startDate = `${season}-01-01`
  const endDate = `${season}-12-31`
  const today = new Date().toISOString().split('T')[0]

  function applyDateFilter<
    T extends {
      gte: (col: string, val: string) => T
      lte: (col: string, val: string) => T
      lt: (col: string, val: string) => T
    },
  >(q: T): T {
    q = q.gte('event_date', startDate).lte('event_date', endDate)
    if (dateFilter === 'past') q = q.lt('event_date', today)
    else if (dateFilter === 'upcoming') q = q.gte('event_date', today)
    return q
  }

  function applyChapterFilter<T extends { eq: (col: string, val: string) => T }>(q: T): T {
    if (chapterSlug === 'permanent') q = q.eq('event_type', 'permanent')
    else if (chapterId) q = q.eq('chapter_id', chapterId)
    return q
  }

  // Get data (all matching rows when pageSize is null, e.g. grid view)
  let query = supabase
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
      start_time,
      distance_km,
      event_type,
      status,
      chapter_id,
      chapters (name)
    `
    )
    .order('event_date', { ascending: true })

  query = applyDateFilter(query)
  query = applyChapterFilter(query)

  if (pageSize !== null) {
    const offset = (page - 1) * pageSize
    query = query.range(offset, offset + pageSize - 1)
  }

  const { data } = await query

  const events = (data as EventForAdminList[]) ?? []

  let totalCount: number
  if (pageSize === null) {
    // Grid view fetches the whole filtered season; no separate count query needed.
    totalCount = events.length
  } else {
    let countQuery = supabase.from('events').select('id', { count: 'exact', head: true })
    countQuery = applyDateFilter(countQuery)
    countQuery = applyChapterFilter(countQuery)
    const { count } = await countQuery
    totalCount = count ?? 0
  }

  if (events.length === 0) return { events, totalCount }

  // Active-rider counts (excludes cancelled, dedups registrations + results).
  const riderCounts = await getEventRiderCounts(events.map((e) => e.id))
  for (const event of events) {
    event.rider_count = riderCounts[event.id] ?? 0
  }

  return { events, totalCount }
}
