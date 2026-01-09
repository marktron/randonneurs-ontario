import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { PageShell } from '@/components/page-shell'
import { getRouteBySlug, getRouteResults, getChapterInfo } from '@/lib/data/routes'

interface PageProps {
  params: Promise<{ chapter: string; slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const route = await getRouteBySlug(slug)

  if (!route) {
    return { title: 'Route Not Found' }
  }

  return {
    title: `${route.name} - Route History`,
    description: `Historical results for the ${route.name} route from Randonneurs Ontario.`,
  }
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}

export default async function RouteDetailPage({ params }: PageProps) {
  const { chapter, slug } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    notFound()
  }

  const [route, results] = await Promise.all([
    getRouteBySlug(slug),
    getRouteResults(slug),
  ])

  if (!route) {
    notFound()
  }

  // Calculate stats
  const totalEvents = results.length
  const totalFinishers = results.reduce((acc, event) => {
    return acc + event.riders.filter(r => !['DNF', 'OTL', 'DQ'].includes(r.time)).length
  }, 0)

  return (
    <PageShell>
      {/* Header */}
      <div className="relative border-b border-border overflow-hidden">
        <Image
          src={chapterInfo.coverImage}
          alt=""
          fill
          className="object-cover editorial-image"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 via-neutral-900/40 to-neutral-900/20" />
        <div className="relative mx-auto max-w-5xl px-6 py-28 md:py-36">
          <p className="eyebrow-hero text-neutral-300 text-shadow-lg">
            Route History
          </p>
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight mt-2 text-white text-shadow-lg">
            {route.name}
          </h1>
          {route.distanceKm && (
            <p className="mt-4 text-lg leading-relaxed text-neutral-200 max-w-xl text-shadow-lg">
              {route.distanceKm} km · {route.chapterName} Chapter
            </p>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-6 sm:gap-10">
              <div className="group">
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70">
                  Events
                </p>
                <p className="font-serif text-2xl sm:text-3xl tracking-tight tabular-nums">
                  {totalEvents}
                </p>
              </div>
              <div className="group">
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70">
                  Finishers
                </p>
                <p className="font-serif text-2xl sm:text-3xl tracking-tight tabular-nums">
                  {totalFinishers}
                </p>
              </div>
            </div>

            {route.rwgpsId && (
              <a
                href={`https://ridewithgps.com/routes/${route.rwgpsId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-base font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
              >
                View on RideWithGPS
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="content-container py-16 md:py-20">
        {results.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No recorded results for this route yet.
          </p>
        ) : (
          <div className="space-y-16">
            {results.map((event) => (
              <article key={`${event.date}-${event.eventName}`} className="scroll-mt-24">
                {/* Event Header */}
                <header className="mb-6">
                  <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
                    {formatFullDate(event.date)}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.riders.length} {event.riders.length === 1 ? 'rider' : 'riders'}
                  </p>
                </header>

                {/* Riders Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
                  {event.riders.map((rider, index) => (
                    <div
                      key={`${rider.slug}-${index}`}
                      className="flex items-baseline justify-between py-1.5 border-b border-border/50"
                    >
                      <Link
                        href={`/riders/${rider.slug}`}
                        className="text-sm hover:text-primary transition-colors truncate pr-4"
                      >
                        {rider.name}
                      </Link>
                      <span
                        className={`text-sm tabular-nums shrink-0 ${
                          rider.time === 'DNF' || rider.time === 'OTL'
                            ? 'text-muted-foreground/60'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {rider.time}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
