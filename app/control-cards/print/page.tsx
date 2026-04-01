import { ControlCardsPrint } from '@/components/admin/control-cards-print'
import {
  computeControlTimes,
  getNominalDistance,
  formatControlTime,
  formatCardDate,
  createTorontoDate,
} from '@/lib/brmTimes'
import type { ControlPoint, CardRider, OrganizerInfo, CardEvent } from '@/types/control-card'

interface ControlInput {
  name: string
  distance: number
}

interface RiderInput {
  firstName: string
  lastName: string
}

interface PrintPageProps {
  searchParams: Promise<{
    routeName?: string
    distance?: string
    chapter?: string
    eventDate?: string
    startTime?: string
    organizerName?: string
    organizerPhone?: string
    organizerEmail?: string
    controls?: string
    riders?: string
    extraBlank?: string
    rwgpsUrl?: string
  }>
}

export default async function PrintPage({ searchParams }: PrintPageProps) {
  const search = await searchParams

  const routeName = search.routeName || 'Unknown Route'
  const distance = parseFloat(search.distance || '0')
  const chapter = search.chapter || 'Randonneurs Ontario'
  const eventDateStr = search.eventDate || ''
  const startTimeStr = search.startTime || '06:00'

  // Parse organizer info
  const organizer: OrganizerInfo = {
    name: search.organizerName || '',
    phone: search.organizerPhone || '',
    email: search.organizerEmail || '',
  }

  // Parse controls
  let controlInputs: ControlInput[] = []
  try {
    if (search.controls) {
      controlInputs = JSON.parse(search.controls)
    }
  } catch {
    controlInputs = []
  }

  // Calculate start datetime in Toronto timezone
  const [year, month, day] = eventDateStr.split('-').map(Number)
  const [hours, minutes] = startTimeStr.split(':').map(Number)
  const startDate = createTorontoDate(year, month - 1, day, hours, minutes)

  // Get nominal distance for BRM calculations
  const nominalDistance = getNominalDistance(distance)

  // Calculate control times
  const controls: ControlPoint[] = controlInputs.map((input, index) => {
    const { openAt, closeAt } = computeControlTimes(
      startDate,
      input.distance,
      nominalDistance,
      distance
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
  const { closeMin } = computeControlTimes(startDate, distance, nominalDistance, distance)
  const totalHours = Math.floor(closeMin / 60)
  const totalMinutes = closeMin % 60

  // Format event data
  const cardEvent: CardEvent = {
    id: 'control-card',
    name: routeName,
    routeName,
    distance,
    nominalDistance,
    date: startDate,
    startTime: startTimeStr,
    startLocation: '',
    chapter,
  }

  // Parse riders from search params
  let riderInputs: RiderInput[] = []
  try {
    if (search.riders) {
      riderInputs = JSON.parse(search.riders)
    }
  } catch {
    riderInputs = []
  }

  const namedRiders: CardRider[] = riderInputs.map((r, i) => ({
    id: `rider-${i + 1}`,
    firstName: r.firstName || '',
    lastName: r.lastName || '',
  }))

  // Extra blank cards
  const extraBlankCount = Math.max(0, parseInt(search.extraBlank || '0', 10) || 0)
  const extraBlanks: CardRider[] = Array.from({ length: extraBlankCount }, (_, i) => ({
    id: `extra-blank-${i + 1}`,
    firstName: '',
    lastName: '',
  }))

  const riders: CardRider[] =
    namedRiders.length > 0 || extraBlankCount > 0
      ? [...namedRiders, ...extraBlanks]
      : [{ id: 'blank-1', firstName: '', lastName: '' }]

  return (
    <ControlCardsPrint
      event={cardEvent}
      organizer={organizer}
      controls={controls}
      riders={riders}
      totalAllowableTime={{ hours: totalHours, minutes: totalMinutes }}
      formattedDate={formatCardDate(startDate)}
      rwgpsUrl={search.rwgpsUrl}
    />
  )
}
