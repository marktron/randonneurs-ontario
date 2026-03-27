import { getPage } from '@/lib/content'
import { createOgImageResponse, resolvePublicImage, size } from '@/lib/og/og-layout'

export const runtime = 'nodejs'
export { size }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getPage(slug)

  if (!page) {
    return createOgImageResponse({
      title: 'Randonneurs Ontario',
      subtitle: 'Long-distance cycling in Ontario, Canada.',
    })
  }

  const backgroundImageUrl = page.headerImage
    ? page.headerImage.startsWith('http')
      ? page.headerImage
      : await resolvePublicImage(page.headerImage)
    : undefined

  return createOgImageResponse({
    title: page.title,
    subtitle: page.description || undefined,
    eyebrow: 'Randonneurs Ontario',
    backgroundImageUrl,
  })
}
