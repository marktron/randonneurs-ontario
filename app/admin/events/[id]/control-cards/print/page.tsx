import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { ControlCardsPrint } from '@/components/admin/control-cards-print'
import { computeControlTimes, getNominalDistance, formatControlTime, formatCardDate, createTorontoDate } from '@/lib/brmTimes'
import type { ControlPoint, CardRider, OrganizerInfo, CardEvent } from '@/types/control-card'
import type {
  EventForControlCards,
  RegistrationForControlCards,
} from '@/types/queries'

interface ControlInput {
  name: string
  distance: number
}

async function getEventDetails(eventId: string): Promise<EventForControlCards | null> {
  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select(`
      id,
      name,
      event_date,
      start_time,
      start_location,
      distance_km,
      event_type,
      chapters (id, name),
      routes (id, name)
    `)
    .eq('id', eventId)
    .single()

  return event as EventForControlCards | null
}

async function getRegistrations(eventId: string): Promise<RegistrationForControlCards[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(`
      id,
      rider_id,
      riders (id, first_name, last_name)
    `)
    .eq('event_id', eventId)
    .eq('status', 'registered')
    .order('registered_at', { ascending: true })

  return (data as RegistrationForControlCards[]) ?? []
}

interface PrintPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    organizerName?: string
    organizerPhone?: string
    organizerEmail?: string
    controls?: string
    extraBlank?: string
  }>
}

export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params
  const search = await searchParams

  await requireAdmin()

  const [event, registrations] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
  ])

  if (!event) {
    notFound()
  }

  // Parse organizer info from search params
  const organizer: OrganizerInfo = {
    name: search.organizerName || '',
    phone: search.organizerPhone || '',
    email: search.organizerEmail || '',
  }

  // Parse controls from search params
  let controlInputs: ControlInput[] = []
  try {
    if (search.controls) {
      controlInputs = JSON.parse(search.controls)
    }
  } catch {
    controlInputs = []
  }

  // Calculate the start datetime in Toronto timezone
  const [year, month, day] = event.event_date.split('-').map(Number)
  const [hours, minutes] = (event.start_time || '06:00').split(':').map(Number)
  const startDate = createTorontoDate(year, month - 1, day, hours, minutes)

  // Get nominal distance for BRM calculations
  const nominalDistance = getNominalDistance(event.distance_km)

  // Calculate control times
  const controls: ControlPoint[] = controlInputs.map((input, index) => {
    const { openAt, closeAt } = computeControlTimes(
      startDate,
      input.distance,
      nominalDistance,
      event.distance_km
    )

    return {
      id: `control-${index}`,
      name: input.name,
      distance: input.distance,
      openTime: formatControlTime(openAt),
      closeTime: formatControlTime(closeAt),
    }
  })

  // Calculate total allowable time
  const { closeMin } = computeControlTimes(
    startDate,
    event.distance_km,
    nominalDistance,
    event.distance_km
  )
  const totalHours = Math.floor(closeMin / 60)
  const totalMinutes = closeMin % 60

  // Format event data
  const cardEvent: CardEvent = {
    id: event.id,
    name: event.name,
    routeName: event.routes?.name || event.name,
    distance: event.distance_km,
    nominalDistance,
    date: startDate,
    startTime: event.start_time || '06:00',
    startLocation: event.start_location || '',
    chapter: event.chapters?.name || 'Randonneurs Ontario',
  }

  // Parse extra blank cards count
  const extraBlankCount = Math.max(0, parseInt(search.extraBlank || '0', 10) || 0)

  // Format riders - if no registrations, create two blank entries
  // Also add any extra blank cards requested
  const registeredRiders: CardRider[] = registrations.filter((r) => r.riders).map((r) => ({
    id: r.riders!.id,
    firstName: r.riders!.first_name,
    lastName: r.riders!.last_name,
  }))

  // Create extra blank cards
  const extraBlankCards: CardRider[] = Array.from({ length: extraBlankCount }, (_, i) => ({
    id: `extra-blank-${i + 1}`,
    firstName: '',
    lastName: '',
  }))

  // If no registrations and no extra blanks, default to 2 blank cards
  const riders: CardRider[] = registeredRiders.length > 0 || extraBlankCount > 0
    ? [...registeredRiders, ...extraBlankCards]
    : [
        { id: 'blank-1', firstName: '', lastName: '' },
        { id: 'blank-2', firstName: '', lastName: '' },
      ]

  return (
    <ControlCardsPrint
      event={cardEvent}
      organizer={organizer}
      controls={controls}
      riders={riders}
      totalAllowableTime={{ hours: totalHours, minutes: totalMinutes }}
      formattedDate={formatCardDate(startDate)}
    />
  )
}
