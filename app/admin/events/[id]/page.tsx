import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EventResultsManager } from '@/components/admin/event-results-manager'
import { EventStatusSelect } from '@/components/admin/event-status-select'
import type { EventStatus } from '@/lib/actions/events'

interface EventDetail {
  id: string
  name: string
  event_date: string
  start_time: string | null
  distance_km: number
  event_type: string
  status: string
  season: number
  chapters: { id: string; name: string } | null
}

interface Registration {
  id: string
  rider_id: string
  registered_at: string
  status: string
  notes: string | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
}

interface Result {
  id: string
  rider_id: string
  finish_time: string | null
  status: string
  team_name: string | null
  note: string | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
}

async function getEventDetails(eventId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event } = await (supabaseAdmin.from('events') as any)
    .select(`
      id,
      name,
      event_date,
      start_time,
      distance_km,
      event_type,
      status,
      season,
      chapters (id, name)
    `)
    .eq('id', eventId)
    .single()

  return event as EventDetail | null
}

async function getRegistrations(eventId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('registrations') as any)
    .select(`
      id,
      rider_id,
      registered_at,
      status,
      notes,
      riders (id, first_name, last_name, email)
    `)
    .eq('event_id', eventId)
    .eq('status', 'registered')
    .order('registered_at', { ascending: true })

  return (data as Registration[]) ?? []
}

async function getResults(eventId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('results') as any)
    .select(`
      id,
      rider_id,
      finish_time,
      status,
      team_name,
      note,
      riders (id, first_name, last_name, email)
    `)
    .eq('event_id', eventId)
    .order('finish_time', { ascending: true, nullsFirst: false })

  return (data as Result[]) ?? []
}

interface EventPageProps {
  params: Promise<{ id: string }>
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const { id } = await params
  await requireAdmin()

  const [event, registrations, results] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
    getResults(id),
  ])

  if (!event) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/events"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Events
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{event.name}</h1>
          <p className="text-muted-foreground">
            {event.chapters?.name} &middot; {event.distance_km}km {event.event_type}
          </p>
        </div>
        <EventStatusSelect
          eventId={event.id}
          initialStatus={event.status as EventStatus}
          resultsCount={results.length}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Date</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">
              {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Start Time</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{event.start_time || 'TBD'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{registrations.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Results Entered</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{results.length}</p>
          </CardContent>
        </Card>
      </div>

      <EventResultsManager
        eventId={event.id}
        eventName={event.name}
        eventStatus={event.status}
        isPastEvent={event.event_date < new Date().toISOString().split('T')[0]}
        season={event.season}
        distanceKm={event.distance_km}
        registrations={registrations}
        results={results}
      />
    </div>
  )
}
