/**
 * Pure rules and wording for how a permanent is ridden: direction and an
 * optional start point elsewhere on the route. No I/O, safe for client and
 * server. See docs/control-cards.md, "Direction and alternate start".
 */

/** One-line summary shown to admins above an event's controls; null when there is nothing to say. */
export function describeRideStartForAdmin(ride: {
  direction: string
  startLocation: string | null
  startOffsetKm: number | null
}): string | null {
  const parts: string[] = []
  if (ride.direction === 'reversed') parts.push('Reversed.')
  const name = ride.startLocation?.trim()
  if (ride.startOffsetKm != null) {
    parts.push(
      `Starts at ${name || 'a point'}, ${Number(ride.startOffsetKm).toFixed(1)} km into the posted route.`
    )
  } else if (name) {
    parts.push(`Rider noted a start at ${name} (no position on the route, controls not adjusted).`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

export function permanentEventSlug(
  routeSlug: string,
  eventDate: string,
  direction: string
): string {
  const base = `permanent-${routeSlug}-${eventDate}`
  return direction === 'reversed' ? `${base}-reverse` : base
}

/** Postgres returns TIME as HH:MM:SS; the form sends HH:MM. */
export function toHHMM(time: string | null): string | null {
  return time ? time.slice(0, 5) : null
}

/** The ride-start fields as stored on an `events` row. */
export interface StoredRideStart {
  start_time: string | null
  start_location: string | null
  start_offset_km: number | null
  direction: string
}

const offsetTenths = (km: number | null) => (km == null ? null : Math.round(Number(km) * 10))

/** Whether two start offsets name the same point (to 0.1 km; null is the posted start). */
export function sameStartOffset(a: number | null, b: number | null): boolean {
  return offsetTenths(a) === offsetTenths(b)
}

function formatClock(hhmm: string | null): string {
  if (!hhmm) return 'an unset time'
  const [h, m] = hhmm.split(':')
  const hour = parseInt(h, 10)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

/**
 * One ride per route, date and direction: the first registrant sets the
 * start time and start point. Returns null when `requested` matches the
 * existing ride, else the message to show the later registrant.
 */
export function permanentStartMismatch(
  existing: StoredRideStart,
  requested: { startTime: string; offsetKm: number | null }
): string | null {
  const sameTime = toHHMM(existing.start_time) === toHHMM(requested.startTime)
  if (sameTime && sameStartOffset(existing.start_offset_km, requested.offsetKm)) return null

  const from =
    existing.start_offset_km == null
      ? 'the posted start'
      : `${existing.start_location?.trim() || 'a point'} (${Number(existing.start_offset_km).toFixed(1)} km into the route)`
  return `A ride on this route is already registered for this date, starting at ${formatClock(toHHMM(existing.start_time))} from ${from}. Join it with the same start, or choose another date.`
}

/** Start line for a permanent's confirmation email, from the stored event. */
export function formatPermanentStartLocation(
  ride: Pick<StoredRideStart, 'start_location' | 'start_offset_km' | 'direction'>
): string {
  const reversed = ride.direction === 'reversed'
  const name = ride.start_location?.trim()
  if (!name) {
    return reversed ? 'Route finish (riding the route reversed)' : 'Start control per route'
  }
  const position =
    ride.start_offset_km == null
      ? ''
      : ` (${Number(ride.start_offset_km).toFixed(1)} km into the route)`
  return `${name}${position}${reversed ? ', riding the route reversed' : ''}`
}
