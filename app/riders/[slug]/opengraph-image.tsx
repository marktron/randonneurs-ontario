import { getRiderBySlug } from '@/lib/data/results'
import { createOgImageResponse, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export const revalidate = 3600
export { size }
export const contentType = 'image/png'
export const alt = 'Randonneurs Ontario — Rider Results'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const rider = await getRiderBySlug(slug)

  if (!rider) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  return createOgImageResponse({
    title: `${rider.firstName} ${rider.lastName}`,
    subtitle: rider.riderNumber ? `Rider No. ${rider.riderNumber}` : undefined,
    badge: 'Rider Results',
    eyebrow: 'Randonneurs Ontario',
  })
}
