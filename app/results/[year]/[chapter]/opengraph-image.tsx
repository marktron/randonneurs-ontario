import { getChapterMeta } from '@/lib/data/results'
import { createOgImageResponse, resolvePublicImage, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export const revalidate = 3600
export { size }
export const contentType = 'image/png'
export const alt = 'Randonneurs Ontario — Results'

export default async function Image({
  params,
}: {
  params: Promise<{ year: string; chapter: string }>
}) {
  const { year, chapter } = await params
  const meta = getChapterMeta(chapter)

  if (!meta) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  const backgroundImageUrl = meta.coverImage ? await resolvePublicImage(meta.coverImage) : undefined

  return createOgImageResponse({
    title: `${year} ${meta.name} Results`,
    badge: 'Results',
    eyebrow: 'Randonneurs Ontario',
    backgroundImageUrl,
  })
}
