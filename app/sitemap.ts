import type { MetadataRoute } from 'next'
import { getAllPages } from '@/lib/content'
import { getAllEventSlugs } from '@/lib/data/events'
import { getActiveRoutes, getAllChapterSlugs } from '@/lib/data/routes'
import { getAllRiders } from '@/lib/data/riders'
import { getAllChaptersWithYears } from '@/lib/data/results'
import { getChapterInfo } from '@/lib/chapter-config'
import { SITE_URL } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/intro`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/calendar`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/calendar/permanents`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/news`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/results`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/routes`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/riders`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/records`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/awards`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/membership`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/mailing-list`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/register/permanent`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/control-cards`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/live-tracking`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/policies`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  // Slugs already served by a static app route (e.g. app/about/page.tsx
  // shadows content/pages/about.md). Derived from staticPages so a content
  // page never gets double-listed just because its slug happens to match a
  // static route.
  const staticRouteSlugs = new Set(
    staticPages
      .map((page) => page.url.slice(baseUrl.length).replace(/^\//, ''))
      .filter((segment) => segment.length > 0 && !segment.includes('/'))
  )

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
  const eventPages: MetadataRoute.Sitemap = eventSlugs.map((event) => ({
    url: `${baseUrl}/register/${event.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
    lastModified: event.updatedAt ?? undefined,
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
      lastModified: route.updatedAt ?? undefined,
    }))

  // Rider pages
  const riderPages: MetadataRoute.Sitemap = allRiders.map((rider) => ({
    url: `${baseUrl}/riders/${rider.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.3,
    lastModified: rider.updatedAt ?? undefined,
  }))

  // Results pages. No `lastModified`: getAllChaptersWithYears only returns
  // { slug, name, years } (via getAvailableYears, which is also used by the
  // per-chapter year picker and returns plain year numbers). Computing a
  // max(updated_at) per chapter/year group would mean either widening
  // getAvailableYears' return type — rippling into its other callers — or an
  // extra query per group, so it's intentionally omitted here.
  const resultsPages: MetadataRoute.Sitemap = chaptersWithYears.flatMap((chapter) =>
    chapter.years.map((year) => ({
      url: `${baseUrl}/results/${year}/${chapter.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    }))
  )

  // Content pages (dynamic [slug] routes). Pages whose slug collides with a
  // static app route (e.g. "about") are shadowed by that route and must not
  // be emitted a second time.
  const contentSitemapPages: MetadataRoute.Sitemap = contentPages
    .filter((page) => !staticRouteSlugs.has(page.slug))
    .map((page) => ({
      url: `${baseUrl}/${page.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      lastModified: page.lastModifiedDate,
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
