import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, Pencil, Calendar, Clock, Users, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventResultsManager } from '@/components/admin/event-results-manager'
import { EventStatusSelect } from '@/components/admin/event-status-select'
import { EventDeleteButton } from '@/components/admin/event-delete-button'
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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/admin/events/${event.id}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/admin/events/${event.id}/control-cards`}>
              <FileText className="h-4 w-4 mr-2" />
              Control Cards
            </Link>
          </Button>
          <EventStatusSelect
            eventId={event.id}
            initialStatus={event.status as EventStatus}
            resultsCount={results.length}
          />
          <EventDeleteButton
            eventId={event.id}
            eventName={event.name}
            isPastEvent={event.event_date < new Date().toISOString().split('T')[0]}
            registrationsCount={registrations.length}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>
            {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>{event.start_time?.slice(0, 5) || 'TBD'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{registrations.length} registered</span>
        </div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          <span>{results.length} results</span>
        </div>
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
