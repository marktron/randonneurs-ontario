import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/registration/manage/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
