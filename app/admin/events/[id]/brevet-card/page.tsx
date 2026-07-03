import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatControlTime } from '@/lib/brmTimes'
import { computeEventStart, computeControlWindow, isDigitalCardEventType } from '@/lib/brevet-card'
import { getEventControlsForAdmin } from '@/lib/actions/event-controls'
import { getEventCheckinsForAdmin } from '@/lib/actions/control-checkins'
import { EventControlsManager } from '@/components/admin/event-controls-manager'
import { EventCheckinsGrid, type GridControl } from '@/components/admin/event-checkins-grid'

interface BrevetCardAdminPageProps {
  params: Promise<{ id: string }>
}

export default async function BrevetCardAdminPage({ params }: BrevetCardAdminPageProps) {
  const { id } = await params
  await requireAdmin()

  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select('id, name, event_date, start_time, distance_km, event_type, status, routes (rwgps_id)')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const typedEvent = event as {
    id: string
    name: string
    event_date: string
    start_time: string | null
    distance_km: number
    event_type: string | null
    status: string | null
    routes: { rwgps_id: string | null } | null
  }

  const [controlsResult, checkinsResult] = await Promise.all([
    getEventControlsForAdmin(id),
    getEventCheckinsForAdmin(id),
  ])

  const controls = controlsResult.success && controlsResult.data ? controlsResult.data : []
  const riders = checkinsResult.success && checkinsResult.data ? checkinsResult.data : []

  const eventStart = computeEventStart(typedEvent.event_date, typedEvent.start_time)
  const gridControls: GridControl[] = controls.map((control) => {
    const window = computeControlWindow(eventStart, control.distanceKm, typedEvent.distance_km)
    return {
      id: control.id,
      name: control.name,
      distanceKm: control.distanceKm,
      windowLabel: `${formatControlTime(window.openAt)} – ${formatControlTime(window.closeAt)}`,
    }
  })

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/events/${typedEvent.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Event
        </Link>
        <h1 className="text-3xl font-bold mt-2">Digital Brevet Card</h1>
        <p className="text-muted-foreground">
          {typedEvent.name} &middot; {typedEvent.distance_km} km
        </p>
        {!isDigitalCardEventType(typedEvent.event_type) && (
          <p className="mt-2 text-sm text-destructive">
            Digital brevet cards are only available for brevets, populaires, and permanents. Riders
            will not see a card for this {typedEvent.event_type ?? 'event'}.
          </p>
        )}
      </div>

      <EventControlsManager
        eventId={typedEvent.id}
        initialControls={controls}
        hasRwgpsRoute={Boolean(typedEvent.routes?.rwgps_id)}
      />

      <EventCheckinsGrid
        eventId={typedEvent.id}
        eventSubmitted={typedEvent.status === 'submitted'}
        controls={gridControls}
        riders={riders}
      />
    </div>
  )
}
