import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { parseLocalDate } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClickableTableRow } from '@/components/admin/clickable-table-row'
import { Calendar, Users, Route, Trophy, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { getEventRiderCounts } from '@/lib/data/event-rider-counts'
import type { EventForDashboard, UpcomingEventForDashboard } from '@/types/queries'

async function getStats() {
  const [eventsResult, ridersResult, routesResult, resultsResult] = await Promise.all([
    getSupabaseAdmin().from('events').select('id', { count: 'exact', head: true }),
    getSupabaseAdmin().from('riders').select('id', { count: 'exact', head: true }),
    getSupabaseAdmin().from('routes').select('id', { count: 'exact', head: true }),
    getSupabaseAdmin().from('results').select('id', { count: 'exact', head: true }),
  ])

  return {
    events: eventsResult.count ?? 0,
    riders: ridersResult.count ?? 0,
    routes: routesResult.count ?? 0,
    results: resultsResult.count ?? 0,
  }
}

async function getEventsNeedingResults(chapterId: string | null): Promise<EventForDashboard[]> {
  const today = new Date().toISOString().split('T')[0]

  let query = getSupabaseAdmin()
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
      distance_km,
      event_type,
      chapters (name)
    `
    )
    .lt('event_date', today)
    .in('status', ['scheduled', 'completed'])
    .order('event_date', { ascending: false })
    .limit(10)

  if (chapterId) {
    query = query.eq('chapter_id', chapterId)
  }

  const { data } = await query
  return (data as EventForDashboard[]) ?? []
}

async function getUpcomingEvents(chapterId: string | null): Promise<UpcomingEventForDashboard[]> {
  const today = new Date().toISOString().split('T')[0]

  let query = getSupabaseAdmin()
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
      start_time,
      distance_km,
      event_type,
      chapters (name)
    `
    )
    .eq('status', 'scheduled')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(5)

  if (chapterId) {
    query = query.eq('chapter_id', chapterId)
  }

  const { data } = await query
  return (data as UpcomingEventForDashboard[]) ?? []
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin()
  const chapterId = admin.chapter_id || null

  const [stats, eventsNeedingResults, upcomingEvents] = await Promise.all([
    getStats(),
    getEventsNeedingResults(chapterId),
    getUpcomingEvents(chapterId),
  ])

  // Active-rider counts (excludes cancelled, dedups registrations + results)
  // for every event shown on the dashboard.
  const eventIds = [
    ...new Set([...eventsNeedingResults.map((e) => e.id), ...upcomingEvents.map((e) => e.id)]),
  ]
  const riderCounts = await getEventRiderCounts(eventIds)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {admin.name}</p>
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>{stats.events.toLocaleString()} events</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{stats.riders.toLocaleString()} riders</span>
        </div>
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4" />
          <span>{stats.routes.toLocaleString()} routes</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          <span>{stats.results.toLocaleString()} results</span>
        </div>
      </div>

      {eventsNeedingResults.length > 0 && (
        <Card className="ring-red-300 ring-3 shadow-md">
          <CardHeader>
            <CardTitle className="text-red-800">Events Needing Attention</CardTitle>
            <CardDescription>
              {eventsNeedingResults.length} completed event
              {eventsNeedingResults.length !== 1 ? 's' : ''} awaiting submission
              {chapterId ? '' : ' (all chapters)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {eventsNeedingResults.map((event) => {
                const riderCount = riderCounts[event.id] || 0
                return (
                  <Link
                    key={event.id}
                    href={`/admin/events/${event.id}`}
                    className="flex items-center justify-between rounded-lg border bg-white p-3 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        {' · '}
                        {event.distance_km}km {event.event_type}
                        {!chapterId && event.chapters?.name && ` · ${event.chapters.name}`}
                        {' · '}
                        {riderCount} rider{riderCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Events</CardTitle>
          <CardDescription>
            {chapterId
              ? 'Next scheduled events for your chapter'
              : 'Next scheduled events across all chapters'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-muted-foreground">No upcoming events scheduled.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    {!chapterId && <TableHead>Chapter</TableHead>}
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Riders</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Distance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingEvents.map((event) => (
                    <ClickableTableRow key={event.id} href={`/admin/events/${event.id}`}>
                      <TableCell>
                        <span className="font-medium">{event.name}</span>
                        <p className="text-sm text-muted-foreground capitalize">
                          {event.event_type}
                        </p>
                      </TableCell>
                      {!chapterId && <TableCell>{event.chapters?.name || '—'}</TableCell>}
                      <TableCell>
                        <span>
                          {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {event.start_time && (
                          <span className="text-muted-foreground ml-2">
                            {event.start_time.slice(0, 5)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums">
                        {riderCounts[event.id] ?? 0}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right">
                        {event.distance_km} km
                      </TableCell>
                    </ClickableTableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
