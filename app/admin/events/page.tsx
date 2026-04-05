import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getChapters } from '@/lib/actions/admin-users'
import { parseLocalDate } from '@/lib/utils'
import { ClickableTableRow } from '@/components/admin/clickable-table-row'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EventFilters, type DateFilter } from '@/components/admin/event-filters'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { EventForAdminList } from '@/types/queries'

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'
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

  // Get deduplicated rider counts across registrations and results
  const eventIds = events.map((e) => e.id)
  const { data: counts } = await getSupabaseAdmin().rpc('get_event_rider_counts', {
    event_ids: eventIds,
  })

  if (counts) {
    const countMap = new Map(
      (counts as Array<{ event_id: string; rider_count: number }>).map((c) => [
        c.event_id,
        c.rider_count,
      ])
    )
    for (const event of events) {
      event.rider_count = countMap.get(event.id) ?? 0
    }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="secondary">Scheduled</Badge>
      case 'completed':
        return <Badge>Completed</Badge>
      case 'submitted':
        return <Badge className="bg-green-600 hover:bg-green-600">Submitted</Badge>
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage event registrations and results</p>
        </div>
        <Button asChild className="self-start">
          <Link href="/admin/events/new">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Link>
        </Button>
      </div>

      <EventFilters
        season={season}
        chapterId={chapterId}
        chapters={chapters}
        seasons={seasons}
        dateFilter={dateFilter}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead className="hidden md:table-cell">Chapter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Distance</TableHead>
              <TableHead className="hidden sm:table-cell">Riders</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No events found
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <ClickableTableRow
                  key={event.id}
                  href={buildEventDetailUrl(event.id, season, chapterId, dateFilter)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{event.name}</span>
                      <p className="text-sm text-muted-foreground capitalize">{event.event_type}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {event.chapters?.name || '—'}
                  </TableCell>
                  <TableCell>
                    {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{event.distance_km} km</TableCell>
                  <TableCell className="hidden sm:table-cell tabular-nums">
                    {event.rider_count ?? 0}
                  </TableCell>
                  <TableCell>{getStatusBadge(event.status ?? 'scheduled')}</TableCell>
                </ClickableTableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
