import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/registration/manage/', '/card/', '/results/submit/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
