import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { RoutePreviewLink } from '@/components/route-preview-link'

export interface Route {
  slug: string
  name: string
  distance: string
  rwgpsUrl: string | null
  cueSheetUrl: string | null
}

export interface RouteCollection {
  name: string
  routes: Route[]
}

export interface RoutesPageProps {
  chapter: string
  chapterSlug: string
  description: string
  coverImage?: string
  collections: RouteCollection[]
}

export function RoutesPage({
  chapter,
  chapterSlug,
  description,
  coverImage,
  collections,
}: RoutesPageProps) {
  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow="Routes"
        title={`${chapter} Chapter Routes`}
        description={description}
      />
      <div className="content-container py-16 md:py-20">
        <div className="space-y-16">
          {collections.map((collection) => (
            <section key={collection.name}>
              <header className="mb-6 pb-3 border-b border-border">
                <h2 className="font-serif text-2xl tracking-tight">{collection.name}</h2>
              </header>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-12">
                {collection.routes.map((route) => (
                  <li key={route.slug}>
                    <RoutePreviewLink
                      name={route.name}
                      distance={route.distance}
                      detailHref={`/routes/${chapterSlug}/${route.slug}`}
                      rwgpsUrl={route.rwgpsUrl}
                      cueSheetUrl={route.cueSheetUrl}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
