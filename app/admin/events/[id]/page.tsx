import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, Pencil, Calendar, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventResultsManager } from '@/components/admin/event-results-manager'
import { EventStatusSelect } from '@/components/admin/event-status-select'
import { EventDeleteButton } from '@/components/admin/event-delete-button'
import type { EventStatus } from '@/lib/actions/events'
import type {
  EventDetailForAdmin,
  RegistrationWithRiderForAdmin,
  ResultWithRiderForAdmin,
} from '@/types/queries'

async function getEventDetails(eventId: string): Promise<EventDetailForAdmin | null> {
  const { data: event } = await getSupabaseAdmin()
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
      season,
      chapters (id, name)
    `
    )
    .eq('id', eventId)
    .single()

  return event as EventDetailForAdmin | null
}

async function getRegistrations(eventId: string): Promise<RegistrationWithRiderForAdmin[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(
      `
      id,
      rider_id,
      registered_at,
      status,
      notes,
      riders (id, first_name, last_name, email, emergency_contact_name, emergency_contact_phone)
    `
    )
    .eq('event_id', eventId)
    .in('status', ['registered', 'incomplete: membership'])
    .order('registered_at', { ascending: true })

  return (data as RegistrationWithRiderForAdmin[]) ?? []
}

async function getResults(eventId: string): Promise<ResultWithRiderForAdmin[]> {
  const { data } = await getSupabaseAdmin()
    .from('results')
    .select(
      `
      id,
      rider_id,
      finish_time,
      status,
      team_name,
      note,
      gpx_url,
      gpx_file_path,
      control_card_front_path,
      control_card_back_path,
      rider_notes,
      submitted_at,
      riders (id, first_name, last_name, email)
    `
    )
    .eq('event_id', eventId)
    .order('finish_time', { ascending: true, nullsFirst: false })

  return (data as ResultWithRiderForAdmin[]) ?? []
}

interface EventPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from_season?: string; from_chapter?: string }>
}

function buildBackUrl(fromSeason?: string, fromChapter?: string): string {
  const params = new URLSearchParams()
  if (fromSeason) params.set('season', fromSeason)
  if (fromChapter) params.set('chapter', fromChapter)
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}

export default async function EventDetailPage({ params, searchParams }: EventPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams])
  await requireAdmin()
  const backUrl = buildBackUrl(search.from_season, search.from_chapter)

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
        href={backUrl}
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
          <span>
            {(() => {
              const registeredRiderIds = new Set(registrations.map((r) => r.rider_id))
              const resultsOnlyCount = results.filter(
                (r) => !registeredRiderIds.has(r.rider_id)
              ).length
              const total = registrations.length + resultsOnlyCount
              return `${total} ${total === 1 ? 'rider' : 'riders'}`
            })()}
          </span>
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
