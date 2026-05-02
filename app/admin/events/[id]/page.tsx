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
  CancelledRegistrationForAdmin,
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
      erw_event_id,
      erw_canonical_url,
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
      team_name,
      is_team_captain,
      share_registration,
      riders (id, first_name, last_name, email, emergency_contact_name, emergency_contact_phone, rider_memberships (membership_type, season))
    `
    )
    .eq('event_id', eventId)
    .in('status', ['registered', 'incomplete: membership'])
    .order('registered_at', { ascending: true })

  return (data as RegistrationWithRiderForAdmin[]) ?? []
}

async function getCancelledRegistrations(
  eventId: string
): Promise<CancelledRegistrationForAdmin[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(
      `
      id,
      rider_id,
      cancelled_at,
      riders (first_name, last_name, email)
    `
    )
    .eq('event_id', eventId)
    .eq('status', 'cancelled')
    .order('cancelled_at', { ascending: true })

  return (data as CancelledRegistrationForAdmin[]) ?? []
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
      distance_km,
      note,
      gpx_url,
      gpx_file_path,
      control_card_front_path,
      control_card_back_path,
      rider_notes,
      submitted_at,
      submission_token,
      riders (id, first_name, last_name, email)
    `
    )
    .eq('event_id', eventId)
    .order('finish_time', { ascending: true, nullsFirst: false })

  return (data as ResultWithRiderForAdmin[]) ?? []
}

// A rider is "first-time" if they have no result from any other event
// with a status other than DNS — i.e. they have never shown up to an
// event before. DNF, OTL, DQ, finished and pending all count as having
// shown up.
async function getFirstTimeRiderIds(eventId: string, riderIds: string[]): Promise<string[]> {
  if (riderIds.length === 0) return []

  const { data } = await getSupabaseAdmin()
    .from('results')
    .select('rider_id')
    .in('rider_id', riderIds)
    .neq('event_id', eventId)
    .neq('status', 'dns')

  const experienced = new Set((data ?? []).map((r) => r.rider_id))
  return riderIds.filter((id) => !experienced.has(id))
}

interface EventPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from_season?: string; from_chapter?: string; from_when?: string }>
}

function buildBackUrl(fromSeason?: string, fromChapter?: string, fromWhen?: string): string {
  const params = new URLSearchParams()
  if (fromSeason) params.set('season', fromSeason)
  if (fromChapter) params.set('chapter', fromChapter)
  if (fromWhen) params.set('when', fromWhen)
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}

export default async function EventDetailPage({ params, searchParams }: EventPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams])
  await requireAdmin()
  const backUrl = buildBackUrl(search.from_season, search.from_chapter, search.from_when)

  const [event, registrations, cancelledRegistrations, results] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
    getCancelledRegistrations(id),
    getResults(id),
  ])

  if (!event) {
    notFound()
  }

  const participantRiderIds = Array.from(
    new Set([...registrations.map((r) => r.rider_id), ...results.map((r) => r.rider_id)])
  )
  const firstTimeRiderIds = await getFirstTimeRiderIds(id, participantRiderIds)

  return (
    <div className="space-y-6">
      <Link
        href={backUrl}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Events
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{event.name}</h1>
          <p className="text-muted-foreground">
            {event.chapters?.name} &middot; {event.distance_km}km {event.event_type}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              const submittedCount = results.filter(
                (r) => r.status && r.status !== 'pending'
              ).length
              return `${submittedCount} ${submittedCount === 1 ? 'result' : 'results'} / ${total} ${total === 1 ? 'rider' : 'riders'}`
            })()}
          </span>
        </div>
      </div>

      <EventResultsManager
        eventId={event.id}
        eventName={event.name}
        eventDate={event.event_date}
        eventType={event.event_type}
        eventStatus={event.status}
        isPastEvent={event.event_date < new Date().toISOString().split('T')[0]}
        season={event.season}
        distanceKm={event.distance_km}
        registrations={registrations}
        cancelledRegistrations={cancelledRegistrations}
        results={results}
        firstTimeRiderIds={firstTimeRiderIds}
      />
    </div>
  )
}
