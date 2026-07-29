import { getEventBySlug } from '@/lib/data/events'
import { createOgImageResponse, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export const revalidate = 3600
export { size }
export const contentType = 'image/png'
export const alt = 'Randonneurs Ontario — Event Registration'

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEventBySlug(slug)

  if (!event) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  const isFleche = event.type === 'Fleche'
  const title = isFleche
    ? `${new Date(event.date + 'T00:00:00').getFullYear()} Fleche`
    : `${event.name}`

  const subtitleParts: string[] = []
  if (!isFleche) subtitleParts.push(`${event.distance} km`)
  subtitleParts.push(formatDate(event.date))
  if (event.startLocation) subtitleParts.push(event.startLocation)

  return createOgImageResponse({
    title,
    subtitle: subtitleParts.join('  \u00b7  '),
    badge: event.type,
    eyebrow: 'Randonneurs Ontario',
    backgroundImageUrl: event.imageUrl || undefined,
  })
}
