import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ControlCardsForm } from '@/components/admin/control-cards-form'
import { getEventControlsForAdmin } from '@/lib/actions/event-controls'
import { normalizeBrevetCardType } from '@/lib/brevet-card'
import type { EventForControlCards, RegistrationForControlCards } from '@/types/queries'

type EventForControlCardsWithStatus = EventForControlCards & { status: string | null }

async function getEventDetails(eventId: string): Promise<EventForControlCardsWithStatus | null> {
  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
      start_time,
      start_location,
      distance_km,
      event_type,
      status,
      chapters (id, name),
      routes (id, name, rwgps_id, rwgps_collection_id)
    `
    )
    .eq('id', eventId)
    .single()

  return event as EventForControlCardsWithStatus | null
}

async function getRegistrations(eventId: string): Promise<RegistrationForControlCards[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(
      `
      id,
      rider_id,
      brevet_card_type,
      riders (id, first_name, last_name)
    `
    )
    .eq('event_id', eventId)
    .eq('status', 'registered')
    .order('registered_at', { ascending: true })

  return (data as RegistrationForControlCards[]) ?? []
}

interface ControlCardsPageProps {
  params: Promise<{ id: string }>
}

export default async function ControlCardsPage({ params }: ControlCardsPageProps) {
  const { id } = await params
  const admin = await requireAdmin()

  const [event, registrations, controlsResult] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
    getEventControlsForAdmin(id),
  ])

  if (!event) {
    notFound()
  }

  const savedControls = controlsResult.success && controlsResult.data ? controlsResult.data : []

  const eventDate = parseLocalDate(event.event_date)

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Event
      </Link>

      <div>
        <h1 className="text-3xl font-bold">Control Cards</h1>
        <p className="text-muted-foreground">
          {event.name} &middot; {event.distance_km}km &middot;{' '}
          {eventDate.toLocaleDateString('en-CA', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>

      <ControlCardsForm
        event={{
          id: event.id,
          name: event.name,
          distance: event.distance_km,
          eventDate: event.event_date,
          startTime: event.start_time || '06:00',
          startLocation: event.start_location || '',
          chapter: event.chapters?.name || 'Randonneurs Ontario',
          rwgpsId: event.routes?.rwgps_id || null,
          rwgpsCollectionId: event.routes?.rwgps_collection_id || null,
          eventType: event.event_type,
        }}
        riders={registrations
          .filter((r) => r.riders)
          .map((r) => ({
            id: r.riders!.id,
            firstName: r.riders!.first_name,
            lastName: r.riders!.last_name,
            brevetCardType: normalizeBrevetCardType(r.brevet_card_type),
          }))}
        organizer={{
          name: admin.name,
          phone: admin.phone || '',
          email: admin.email,
        }}
        savedControls={savedControls}
        eventSubmitted={event.status === 'submitted'}
      />
    </div>
  )
}
