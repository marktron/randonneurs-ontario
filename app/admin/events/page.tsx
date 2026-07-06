import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getChapters } from '@/lib/actions/admin-users'
import { getEventRiderCounts } from '@/lib/data/event-rider-counts'
import { EventsTable } from '@/components/admin/events-table'
import { Button } from '@/components/ui/button'
import { EventFilters, type DateFilter } from '@/components/admin/event-filters'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getCurrentSeasonLabel } from '@/lib/season'
import type { EventForAdminList } from '@/types/queries'

const currentSeason = getCurrentSeasonLabel()
const PAGE_SIZE = 50

function buildEventDetailUrl(
  eventId: string,
  season: string,
  chapterId: string | null,
  dateFilter: DateFilter
): string {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('from_season', season)
  if (chapterId) params.set('from_chapter', chapterId)
  if (dateFilter !== 'all') params.set('from_when', dateFilter)
  const qs = params.toString()
  return `/admin/events/${eventId}${qs ? `?${qs}` : ''}`
}

function buildPageUrl(
  page: number,
  season: string,
  chapterParam: string | undefined,
  dateFilter: DateFilter
): string {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('season', season)
  if (chapterParam) params.set('chapter', chapterParam)
  if (dateFilter !== 'all') params.set('when', dateFilter)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}

async function getAvailableSeasons(): Promise<string[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_event_seasons')

  if (!data || data.length === 0) return [currentSeason]

  return data.map((row: { season: number }) => row.season.toString())
}

async function getEvents(
  season: string,
  dateFilter: DateFilter,
  chapterId?: string,
  chapterSlug?: string,
  page: number = 1
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

  // Get total count with same filters
  let countQuery = getSupabaseAdmin().from('events').select('id', { count: 'exact', head: true })

  countQuery = applyDateFilter(countQuery)
  countQuery = applyChapterFilter(countQuery)

  const { count } = await countQuery
  const totalCount = count ?? 0

  // Get paginated data
  const offset = (page - 1) * PAGE_SIZE
  let query = getSupabaseAdmin()
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
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

  const { data } = await query.range(offset, offset + PAGE_SIZE - 1)

  const events = (data as EventForAdminList[]) ?? []

  if (events.length === 0) return { events, totalCount }

  // Active-rider counts (excludes cancelled, dedups registrations + results).
  const riderCounts = await getEventRiderCounts(events.map((e) => e.id))
  for (const event of events) {
    event.rider_count = riderCounts[event.id] ?? 0
  }

  return { events, totalCount }
}

interface AdminEventsPageProps {
  searchParams: Promise<{ season?: string; chapter?: string; page?: string; when?: string }>
}

export default async function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  const [admin, params, chapters, seasons] = await Promise.all([
    requireAdmin(),
    searchParams,
    getChapters(),
    getAvailableSeasons(),
  ])

  const season = params.season || currentSeason
  // Use URL param if set, otherwise default to admin's chapter (if they have one)
  // 'all' means explicitly show all chapters (overrides admin default)
  const chapterId = params.chapter === 'all' ? null : (params.chapter ?? admin.chapter_id ?? null)
  const chapterSlug = chapterId ? chapters.find((c) => c.id === chapterId)?.slug : undefined
  const dateFilter: DateFilter =
    params.when === 'past' || params.when === 'upcoming' ? params.when : 'all'
  const page = Math.max(1, parseInt(params.page || '1', 10))
  const { events, totalCount } = await getEvents(
    season,
    dateFilter,
    chapterId || undefined,
    chapterSlug,
    page
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage event registrations and results</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Link>
          </Button>
        </div>
      </div>

      <EventFilters
        season={season}
        chapterId={chapterId}
        chapters={chapters}
        seasons={seasons}
        dateFilter={dateFilter}
      />

      <EventsTable
        events={events}
        buildEventDetailUrl={(eventId) =>
          buildEventDetailUrl(eventId, season, chapterId, dateFilter)
        }
      />

      {totalCount > 0 && (
        <AdminPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          buildPageUrl={(p) => buildPageUrl(p, season, params.chapter, dateFilter)}
          label="events"
        />
      )}
    </div>
  )
}
