import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getFirstTimeRiderIds } from '@/lib/data/first-time-riders'
import { notFound } from 'next/navigation'
import { ControlCardsPrint } from '@/components/admin/control-cards-print'
import { selectRegistrations } from '@/lib/control-cards-selection'
import {
  computeControlTimes,
  getNominalDistance,
  formatControlTime,
  formatCardDate,
  createTorontoDate,
} from '@/lib/brmTimes'
import { buildCardLegsFromRows, type ControlRowForLegs } from '@/lib/controlPoints'
import { isDigitalCardEventType, normalizeBrevetCardType } from '@/lib/brevet-card'
import { SITE_URL } from '@/lib/site-url'
import type {
  ControlPoint,
  CardRider,
  OrganizerInfo,
  CardEvent,
  CardLeg,
} from '@/types/control-card'
import type { EventForControlCards, RegistrationForControlCardsWithToken } from '@/types/queries'

interface ControlInput {
  name: string
  distance: number
}

async function getEventDetails(eventId: string): Promise<EventForControlCards | null> {
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
      chapters (id, name),
      routes (id, name, rwgps_id)
    `
    )
    .eq('id', eventId)
    .single()

  return event as EventForControlCards | null
}

async function getRegistrations(eventId: string): Promise<RegistrationForControlCardsWithToken[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(
      `
      id,
      rider_id,
      management_token,
      brevet_card_type,
      riders (id, first_name, last_name)
    `
    )
    .eq('event_id', eventId)
    .eq('status', 'registered')
    .order('registered_at', { ascending: true })

  return (data as RegistrationForControlCardsWithToken[]) ?? []
}

/**
 * Stored digital-card controls, position-ordered with their leg tags. Leg
 * events print from these rows — the DB is the source of truth at print
 * time; a leg control list is far too large for the print URL (~14 KB
 * request-line cap on Vercel).
 */
async function getStoredControlRows(eventId: string): Promise<ControlRowForLegs[]> {
  const { data } = await getSupabaseAdmin()
    .from('event_controls')
    .select('name, distance_km, leg_rwgps_id, leg_name')
    .eq('event_id', eventId)
    .order('position', { ascending: true })

  const rows = (data ?? []) as {
    name: string
    distance_km: number
    leg_rwgps_id: string | null
    leg_name: string | null
  }[]

  return rows.map((row) => ({
    name: row.name,
    distanceKm: row.distance_km,
    legRwgpsId: row.leg_rwgps_id,
    legName: row.leg_name,
  }))
}

interface PrintPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    organizerName?: string
    organizerPhone?: string
    organizerEmail?: string
    controls?: string
    extraBlank?: string
    riderIds?: string
  }>
}

export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params
  const search = await searchParams

  await requireAdmin()

  const [event, registrations, storedControlRows] = await Promise.all([
    getEventDetails(id),
    getRegistrations(id),
    getStoredControlRows(id),
  ])

  if (!event) {
    notFound()
  }

  const selectedRegistrations = selectRegistrations(registrations, search.riderIds)

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

  // Collection events: one CardLeg per stored leg, built from the DB rows
  // (the form omits the `controls` param for leg events — the saved
  // event_controls rows are the source of truth at print time). Leg cards
  // never print open/close times (the overall event limit governs), and
  // distances are per-leg (each leg restarts at 0). Null unless every
  // stored row is leg-tagged — single-route events fall through to the
  // unchanged query-param flow below.
  const legs: CardLeg[] | undefined = buildCardLegsFromRows(storedControlRows) ?? undefined

  // Single-route events: unchanged BRM open/close computation.
  const controls: ControlPoint[] = legs
    ? []
    : controlInputs.map((input, index) => {
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
    // The event's own name, not the linked route's. A route name carries
    // RWGPS-side edits and version suffixes and is often shared across
    // events, so it drifts from what riders were told they registered for.
    // Collection events are the exception and override this per card:
    // `eventFor(leg)` in ControlCardsPrint substitutes the leg name.
    routeName: event.name,
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
  const baseUrl = SITE_URL
  const registeredRiderIds = selectedRegistrations.filter((r) => r.riders).map((r) => r.riders!.id)
  const firstTimeRiderIdSet = new Set(await getFirstTimeRiderIds(id, registeredRiderIds))
  // Mirror the /card/[token] availability check so the printed QR never
  // lands on the "not set up" page: eligible event type + stored controls.
  const digitalCardAvailable =
    isDigitalCardEventType(event.event_type) && storedControlRows.length > 0
  const registeredRiders: CardRider[] = selectedRegistrations
    .filter((r) => r.riders)
    .map((r) => ({
      id: r.riders!.id,
      firstName: r.riders!.first_name,
      lastName: r.riders!.last_name,
      submissionUrl: r.management_token
        ? `${baseUrl}/registration/manage/${r.management_token}`
        : undefined,
      cardUrl:
        digitalCardAvailable && r.management_token
          ? `${baseUrl}/card/${r.management_token}`
          : undefined,
      isFirstTimeRider: firstTimeRiderIdSet.has(r.riders!.id),
      brevetCardType: normalizeBrevetCardType(r.brevet_card_type),
    }))

  // Create extra blank cards
  const extraBlankCards: CardRider[] = Array.from({ length: extraBlankCount }, (_, i) => ({
    id: `extra-blank-${i + 1}`,
    firstName: '',
    lastName: '',
  }))

  // If no registrations and no extra blanks, default to 2 blank cards
  const riders: CardRider[] =
    registeredRiders.length > 0 || extraBlankCount > 0
      ? [...registeredRiders, ...extraBlankCards]
      : [
          { id: 'blank-1', firstName: '', lastName: '' },
          { id: 'blank-2', firstName: '', lastName: '' },
        ]

  const rwgpsUrl = event.routes?.rwgps_id
    ? `https://ridewithgps.com/routes/${event.routes.rwgps_id}`
    : undefined

  return (
    <ControlCardsPrint
      event={cardEvent}
      organizer={organizer}
      controls={controls}
      riders={riders}
      totalAllowableTime={{ hours: totalHours, minutes: totalMinutes }}
      formattedDate={formatCardDate(startDate)}
      rwgpsUrl={rwgpsUrl}
      legs={legs}
    />
  )
}
