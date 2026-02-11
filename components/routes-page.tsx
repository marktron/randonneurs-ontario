import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { RoutePreviewLink } from '@/components/route-preview-link'

export interface Route {
  name: string
  distance: string
  url: string
}

export interface RouteCollection {
  name: string
  routes: Route[]
}

export interface RoutesPageProps {
  chapter: string
  description: string
  coverImage?: string
  collections: RouteCollection[]
}

export function RoutesPage({ chapter, description, coverImage, collections }: RoutesPageProps) {
  return (
    <PageShell>
      <PageHero image={coverImage} eyebrow="Routes" title={chapter} description={description} />
      <div className="content-container py-16 md:py-20">
        <div className="space-y-16">
          {collections.map((collection) => (
            <section key={collection.name}>
              <header className="mb-6 pb-3 border-b border-border">
                <h2 className="font-serif text-2xl tracking-tight">{collection.name}</h2>
              </header>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2">
                {collection.routes.map((route, index) => (
                  <li key={`${route.url}-${index}`}>
                    <RoutePreviewLink name={route.name} distance={route.distance} url={route.url} />
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
