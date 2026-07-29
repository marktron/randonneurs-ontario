import { getRouteBySlug, getChapterInfo } from '@/lib/data/routes'
import { createOgImageResponse, resolvePublicImage, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export const revalidate = 3600
export { size }
export const contentType = 'image/png'
export const alt = 'Randonneurs Ontario — Route History'

export default async function Image({
  params,
}: {
  params: Promise<{ chapter: string; slug: string }>
}) {
  const { chapter, slug } = await params
  const route = await getRouteBySlug(slug)
  const chapterInfo = getChapterInfo(chapter)

  if (!route) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  const backgroundImageUrl = chapterInfo?.coverImage
    ? await resolvePublicImage(chapterInfo.coverImage)
    : undefined

  const subtitle = [route.distanceKm ? `${route.distanceKm} km` : null, chapterInfo?.name]
    .filter(Boolean)
    .join('  \u00b7  ')

  return createOgImageResponse({
    title: route.name,
    subtitle: subtitle || undefined,
    badge: 'Route History',
    eyebrow: 'Randonneurs Ontario',
    backgroundImageUrl,
  })
}
