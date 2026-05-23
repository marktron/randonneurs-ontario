/**
 * JSON-LD structured data components for SEO.
 * Renders <script type="application/ld+json"> tags with schema.org markup.
 */

interface OrganizationJsonLdProps {
  baseUrl: string
}

export function OrganizationJsonLd({ baseUrl }: OrganizationJsonLdProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: 'Randonneurs Ontario',
    url: baseUrl,
    logo: `${baseUrl}/favicon.ico`,
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
    startDate: `${date}T${startTime}`,
    url,
    sport: 'Cycling',
    organizer: {
      '@type': 'SportsOrganization',
      name: 'Randonneurs Ontario',
      url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca',
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
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'

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
