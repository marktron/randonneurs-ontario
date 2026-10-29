import { createSlug } from '@/lib/utils'

/** Builds an event slug: {name}-{distance}km-{date}, matching the import script. */
export function buildEventSlug(name: string, distanceKm: number, eventDate: string): string {
  return `${createSlug(name)}-${distanceKm}km-${eventDate}`
}

export interface StoredSlugFields {
  slug: string
  name: string
  distance_km: number
  event_date: string
  event_type: string
}

export interface IncomingSlugFields {
  name?: string
  distanceKm?: number
  eventDate?: string
}

/** Returns the new slug, or null when nothing should change. */
export function planSlugRotation(
  stored: StoredSlugFields,
  incoming: IncomingSlugFields
): string | null {
  if (incoming.eventDate === undefined) return null
  if (incoming.eventDate === stored.event_date) return null
  if (stored.event_type === 'permanent') return null

  const next = buildEventSlug(
    incoming.name ?? stored.name,
    incoming.distanceKm ?? stored.distance_km,
    incoming.eventDate
  )
  return next === stored.slug ? null : next
}
