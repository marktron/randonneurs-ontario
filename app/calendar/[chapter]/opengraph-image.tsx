import { getChapterInfo } from '@/lib/data/events'
import { createOgImageResponse, resolvePublicImage, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export { size }
export const contentType = 'image/png'
export const alt = 'Randonneurs Ontario — Event Calendar'

export default async function Image({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  const backgroundImageUrl = chapterInfo.coverImage
    ? await resolvePublicImage(chapterInfo.coverImage)
    : undefined

  return createOgImageResponse({
    title: `${chapterInfo.name} Chapter`,
    subtitle: chapterInfo.description,
    badge: 'Calendar',
    eyebrow: 'Randonneurs Ontario',
    backgroundImageUrl,
  })
}
