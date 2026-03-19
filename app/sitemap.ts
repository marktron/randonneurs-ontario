import type { MetadataRoute } from 'next'
import { getAllPages } from '@/lib/content'
import { getAllEventSlugs } from '@/lib/data/events'
import { getActiveRoutes, getAllChapterSlugs } from '@/lib/data/routes'
import { getAllRiders } from '@/lib/data/riders'
import { getAllChaptersWithYears } from '@/lib/data/results'
import { getUrlSlugFromDbSlug, getChapterInfo } from '@/lib/chapter-config'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/intro`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/calendar`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/calendar/permanents`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/news`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/results`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/riders`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/records`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/membership`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/mailing-list`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/register/permanent`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/policies`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  // Calendar chapter pages
  const chapterSlugs = getAllChapterSlugs()
  const chapterPages: MetadataRoute.Sitemap = chapterSlugs.flatMap((slug) => [
    { url: `${baseUrl}/calendar/${slug}`, changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/routes/${slug}`, changeFrequency: 'monthly' as const, priority: 0.6 },
  ])

  // Fetch dynamic data in parallel
  const [eventSlugs, activeRoutes, allRiders, chaptersWithYears, contentPages] = await Promise.all([
    getAllEventSlugs(),
    getActiveRoutes(),
    getAllRiders(),
    getAllChaptersWithYears(),
    Promise.resolve(getAllPages()),
  ])

  // Event registration pages
  const eventPages: MetadataRoute.Sitemap = eventSlugs.map((slug) => ({
    url: `${baseUrl}/register/${slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // Route detail pages - map chapter name to URL slug
  const chapterNameToSlug = new Map<string, string>()
  for (const slug of chapterSlugs) {
    const info = getChapterInfo(slug)
    if (info) chapterNameToSlug.set(info.name, slug)
  }

  const routePages: MetadataRoute.Sitemap = activeRoutes
    .filter((route) => route.chapterName && chapterNameToSlug.has(route.chapterName))
    .map((route) => ({
      url: `${baseUrl}/routes/${chapterNameToSlug.get(route.chapterName!)}/${route.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))

  // Rider pages
  const riderPages: MetadataRoute.Sitemap = allRiders.map((rider) => ({
    url: `${baseUrl}/riders/${rider.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  }))

  // Results pages
  const resultsPages: MetadataRoute.Sitemap = chaptersWithYears.flatMap((chapter) =>
    chapter.years.map((year) => ({
      url: `${baseUrl}/results/${year}/${chapter.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    }))
  )

  // Content pages (dynamic [slug] routes)
  const contentSitemapPages: MetadataRoute.Sitemap = contentPages.map((page) => ({
    url: `${baseUrl}/${page.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  return [
    ...staticPages,
    ...chapterPages,
    ...eventPages,
    ...routePages,
    ...riderPages,
    ...resultsPages,
    ...contentSitemapPages,
  ]
}
