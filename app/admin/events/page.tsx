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
import { EventFilters } from '@/components/admin/event-filters'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { EventForAdminList } from '@/types/queries'

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'

function buildEventDetailUrl(eventId: string, season: string, chapterId: string | null): string {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('from_season', season)
  if (chapterId) params.set('from_chapter', chapterId)
  const qs = params.toString()
  return `/admin/events/${eventId}${qs ? `?${qs}` : ''}`
}

async function getAvailableSeasons(): Promise<string[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_event_seasons')

  if (!data || data.length === 0) return [currentSeason]

  return data.map((row: { season: number }) => row.season.toString())
}

async function getEvents(season: string, chapterId?: string): Promise<EventForAdminList[]> {
  const startDate = `${season}-01-01`
  const endDate = `${season}-12-31`

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
      chapters (name),
      registrations (count),
      results (count)
    `
    )
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date', { ascending: true })

  if (chapterId) {
    query = query.eq('chapter_id', chapterId)
  }

  const { data } = await query.limit(200)

  return (data as EventForAdminList[]) ?? []
}

interface AdminEventsPageProps {
  searchParams: Promise<{ season?: string; chapter?: string }>
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
  const events = await getEvents(season, chapterId || undefined)

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage event registrations and results</p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Link>
        </Button>
      </div>

      <EventFilters season={season} chapterId={chapterId} chapters={chapters} seasons={seasons} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Riders</TableHead>
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
                  href={buildEventDetailUrl(event.id, season, chapterId)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{event.name}</span>
                      <p className="text-sm text-muted-foreground capitalize">{event.event_type}</p>
                    </div>
                  </TableCell>
                  <TableCell>{event.chapters?.name || '—'}</TableCell>
                  <TableCell>
                    {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>{event.distance_km} km</TableCell>
                  <TableCell className="tabular-nums">
                    {(event.registrations?.[0]?.count ?? 0) + (event.results?.[0]?.count ?? 0)}
                  </TableCell>
                  <TableCell>{getStatusBadge(event.status ?? 'scheduled')}</TableCell>
                </ClickableTableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
