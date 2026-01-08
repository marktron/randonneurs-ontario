import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
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
import { EventFilters } from '@/components/admin/event-filters'
import type { EventWithChapter } from '@/types/ui'

type TimeFilter = 'all' | 'upcoming' | 'past'

async function getEvents(filter: TimeFilter, chapterId?: string) {
  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabaseAdmin.from('events') as any)
    .select(`
      id,
      name,
      event_date,
      distance_km,
      event_type,
      status,
      chapter_id,
      chapters (name)
    `)

  if (chapterId) {
    query = query.eq('chapter_id', chapterId)
  }

  if (filter === 'upcoming') {
    // Future events: soonest first
    query = query.gte('event_date', today).order('event_date', { ascending: true })
  } else if (filter === 'past') {
    // Past events: most recent first
    query = query.lt('event_date', today).order('event_date', { ascending: false })
  } else {
    // All events: most recent first
    query = query.order('event_date', { ascending: false })
  }

  const { data } = await query.limit(200)

  return (data as EventWithChapter[]) ?? []
}

interface AdminEventsPageProps {
  searchParams: Promise<{ filter?: string; chapter?: string }>
}

export default async function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  const [admin, params, chapters] = await Promise.all([
    requireAdmin(),
    searchParams,
    getChapters(),
  ])

  const filter = (params.filter as TimeFilter) || 'all'
  // Use URL param if set, otherwise default to admin's chapter (if they have one)
  // 'all' means explicitly show all chapters (overrides admin default)
  const chapterId = params.chapter === 'all'
    ? null
    : (params.chapter ?? admin.chapter_id ?? null)
  const events = await getEvents(filter, chapterId || undefined)

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
      <div>
        <h1 className="text-3xl font-bold">Events</h1>
        <p className="text-muted-foreground">
          Manage event registrations and results
        </p>
      </div>

      <EventFilters
        timeFilter={filter}
        chapterId={chapterId}
        chapters={chapters}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No events found
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <ClickableTableRow key={event.id} href={`/admin/events/${event.id}`}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{event.name}</span>
                      <p className="text-sm text-muted-foreground capitalize">
                        {event.event_type}
                      </p>
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
                  <TableCell>{getStatusBadge(event.status)}</TableCell>
                </ClickableTableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
