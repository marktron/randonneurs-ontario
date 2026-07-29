/**
 * JSON-LD structured data components for SEO.
 * Renders <script type="application/ld+json"> tags with schema.org markup.
 */

import { SITE_URL } from '@/lib/site-url'

interface OrganizationJsonLdProps {
  baseUrl: string
}

export function OrganizationJsonLd({ baseUrl }: OrganizationJsonLdProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: 'Randonneurs Ontario',
    url: baseUrl,
    // Google requires a real raster logo >= 112x112px, not a .ico favicon.
    // /logo-512.png (512x349) is the high-res club logo; natural aspect
    // ratio is fine — square is only needed for favicon/app-icon uses.
    logo: `${baseUrl}/logo-512.png`,
    description:
      'Long-distance cycling club in Ontario, Canada. Organizing brevets, populaires, and other randonneuring events.',
    sport: 'Cycling',
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Ontario, Canada',
    },
    memberOf: {
      '@type': 'SportsOrganization',
      name: 'Randonneurs Canada',
      url: 'https://randonneurscanada.ca',
    },
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}

/**
 * Compute the UTC offset (e.g. "-05:00" or "-04:00") that America/Toronto
 * observes on a given calendar date, DST-aware. Events are always scheduled
 * in Ontario, so this lets us build a schema.org-correct ISO 8601 startDate
 * (`${date}T${startTime}${offset}`) without a fixed offset that would be
 * wrong for half the year.
 *
 * date-fns-tz is not a project dependency; Intl.DateTimeFormat's
 * "shortOffset" timeZoneName already exposes exactly this on Node 18+/modern
 * browsers, so we use that instead of adding a new dependency.
 *
 * Noon UTC is used as the probe instant (rather than midnight, or the actual
 * event time) so the result is never ambiguous around Toronto's ~2am local
 * DST transition — we only need the offset for the date, not the instant.
 */
export function getTorontoUtcOffset(dateStr: string): string {
  const probeDate = new Date(`${dateStr}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    timeZoneName: 'shortOffset',
  })
  const tzName = formatter.formatToParts(probeDate).find((p) => p.type === 'timeZoneName')?.value

  // tzName looks like "GMT-5" or "GMT-4" (occasionally "GMT-5:30"-style, not
  // applicable to Toronto, but handled for robustness).
  const match = tzName?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return '-05:00' // fall back to standard time offset

  const [, sign, hours, minutes = '00'] = match
  return `${sign}${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

interface EventJsonLdProps {
  name: string
  date: string
  startTime: string
  location?: string | null
  description?: string | null
  url: string
  imageUrl?: string | null
  status?: 'scheduled' | 'cancelled'
}

export function EventJsonLd({
  name,
  date,
  startTime,
  location,
  description,
  url,
  imageUrl,
  status = 'scheduled',
}: EventJsonLdProps) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    startDate: `${date}T${startTime}${getTorontoUtcOffset(date)}`,
    url,
    sport: 'Cycling',
    organizer: {
      '@type': 'SportsOrganization',
      name: 'Randonneurs Ontario',
      url: SITE_URL,
    },
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus:
      status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
  }

  if (location) {
    data.location = {
      '@type': 'Place',
      name: location,
    }
  }

  if (description) {
    data.description = description
  }

  if (imageUrl) {
    data.image = imageUrl
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}

interface BreadcrumbJsonLdProps {
  items: Array<{ name: string; href: string }>
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const baseUrl = SITE_URL

  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.href}`,
    })),
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
