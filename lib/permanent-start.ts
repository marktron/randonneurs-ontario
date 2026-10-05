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
