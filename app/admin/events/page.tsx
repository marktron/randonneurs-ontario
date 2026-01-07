import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import Link from 'next/link'
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
import { Eye } from 'lucide-react'

interface EventWithChapter {
  id: string
  name: string
  event_date: string
  distance_km: number
  event_type: string
  status: string
  chapters: { name: string } | null
}

async function getEvents() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('events') as any)
    .select(`
      id,
      name,
      event_date,
      distance_km,
      event_type,
      status,
      chapters (name)
    `)
    .order('event_date', { ascending: false })
    .limit(100)

  return (data as EventWithChapter[]) ?? []
}

export default async function AdminEventsPage() {
  await requireAdmin()
  const events = await getEvents()

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="secondary">Scheduled</Badge>
      case 'completed':
        return <Badge>Completed</Badge>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
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
                <TableRow key={event.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {event.event_type}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{event.chapters?.name || '—'}</TableCell>
                  <TableCell>
                    {new Date(event.event_date).toLocaleDateString('en-CA', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>{event.distance_km} km</TableCell>
                  <TableCell>{getStatusBadge(event.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link href={`/admin/events/${event.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
