import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ControlCardsForm } from '@/components/admin/control-cards-form'

interface EventDetail {
  id: string
  name: string
  event_date: string
  start_time: string | null
  start_location: string | null
  distance_km: number
  event_type: string
  chapters: { id: string; name: string } | null
  routes: { id: string; name: string; rwgps_id: string | null } | null
}

interface Registration {
  id: string
  rider_id: string
  riders: {
    id: string
    first_name: string
    last_name: string
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
      start_location,
      distance_km,
      event_type,
      chapters (id, name),
      routes (id, name, rwgps_id)
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
      riders (id, first_name, last_name)
    `)
    .eq('event_id', eventId)
    .eq('status', 'registered')
    .order('registered_at', { ascending: true })

  return (data as Registration[]) ?? []
}

interface ControlCardsPageProps {
  params: Promise<{ id: string }>
}

export default async function ControlCardsPage({ params }: ControlCardsPageProps) {
  const { id } = await params
  const admin = await requireAdmin()

  const [event, registrations] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
  ])

  if (!event) {
    notFound()
  }

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
          routeName: event.routes?.name || event.name,
          distance: event.distance_km,
          eventDate: event.event_date,
          startTime: event.start_time || '06:00',
          startLocation: event.start_location || '',
          chapter: event.chapters?.name || 'Randonneurs Ontario',
          rwgpsId: event.routes?.rwgps_id || null,
        }}
        riders={registrations.map((r) => ({
          id: r.riders.id,
          firstName: r.riders.first_name,
          lastName: r.riders.last_name,
        }))}
        organizer={{
          name: admin.name,
          phone: admin.phone || '',
          email: admin.email,
        }}
      />
    </div>
  )
}
