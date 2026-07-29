import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { getRoutesByChapter } from '@/lib/data/routes'
import { getAllChapterSlugs, getChapterInfo } from '@/lib/chapter-config'

// Revalidate every hour
export const revalidate = 3600

export const metadata = {
  title: 'Routes',
  description:
    'Browse route libraries for every Randonneurs Ontario chapter, with maps and cue sheets for brevets and populaires across the province.',
}

export default async function RoutesIndexPage() {
  const chapterSlugs = getAllChapterSlugs()

  const chapters = await Promise.all(
    chapterSlugs.map(async (slug) => {
      const chapterInfo = getChapterInfo(slug)
      const collections = await getRoutesByChapter(slug)
      const routeCount = collections.reduce(
        (total, collection) => total + collection.routes.length,
        0
      )
      return { slug, chapterInfo, routeCount }
    })
  )

  return (
    <PageShell>
      <PageHero
        eyebrow="Route Libraries"
        title="Routes"
        description="Browse maps and cue sheets for the brevets and populaires ridden by each Randonneurs Ontario chapter."
      />

      <div className="content-container py-16 md:py-20">
        <div className="grid gap-8 md:grid-cols-2">
          {chapters.map(({ slug, chapterInfo, routeCount }) => {
            if (!chapterInfo) return null

            return (
              <Link
                key={slug}
                href={`/routes/${slug}`}
                className="group block p-6 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <h2 className="font-serif text-2xl tracking-tight group-hover:text-primary transition-colors">
                  {chapterInfo.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{chapterInfo.description}</p>
                <p className="text-sm text-muted-foreground mt-3">
                  {routeCount} {routeCount === 1 ? 'route' : 'routes'}
                </p>
              </Link>
            )
          })}
        </div>

        {chapters.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No routes available yet.</p>
        )}
      </div>
    </PageShell>
  )
}
