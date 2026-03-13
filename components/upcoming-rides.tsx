import Link from 'next/link'
import { getEventsByChapter, getAllChapterSlugs, getChapterInfo } from '@/lib/data/events'
import type { Event } from '@/components/event-card'

/**
 * Return all events whose dates fall within the first `n` unique dates.
 * Assumes events are already sorted by date.
 */
export function eventsForFirstNDates(events: Event[], n: number): Event[] {
  const dates = new Set<string>()
  const result: Event[] = []
  for (const event of events) {
    dates.add(event.date)
    if (dates.size > n) break
    result.push(event)
  }
  return result
}

function formatDate(dateString: string): { month: string; day: string } {
  const date = new Date(dateString + 'T00:00:00')
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate().toString()
  return { month, day }
}

export async function UpcomingRides() {
  const chapterSlugs = getAllChapterSlugs()
  const chapters = await Promise.all(
    chapterSlugs.map(async (slug) => {
      const info = getChapterInfo(slug)
      const events = await getEventsByChapter(slug)
      return { slug, name: info?.name ?? slug, events }
    })
  )

  // Sort by earliest upcoming event date, then alphabetically by name
  chapters.sort((a, b) => {
    const dateA = a.events[0]?.date ?? ''
    const dateB = b.events[0]?.date ?? ''
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return a.name.localeCompare(b.name)
  })

  return (
    <aside className="w-full">
      <h2 className="font-serif text-2xl tracking-tight mb-4">Upcoming Rides</h2>

      <div className="space-y-4">
        {chapters.map((chapter) => {
          const rides = eventsForFirstNDates(chapter.events, 3)
          if (rides.length === 0) return null

          return (
            <div key={chapter.slug}>
              {/* Chapter name as overline */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
                  {chapter.name}
                </h3>
                <Link
                  href={`/calendar/${chapter.slug}`}
                  className="text-xs font-medium text-primary hover:underline underline-offset-2"
                  aria-label={`View all ${chapter.name} events`}
                >
                  View all
                </Link>
              </div>

              {/* Rides list */}
              <ul className="space-y-1">
                {rides.map((ride) => {
                  const { month, day } = formatDate(ride.date)
                  return (
                    <li key={ride.slug}>
                      <Link
                        href={`/register/${ride.slug}`}
                        className="group flex items-start gap-2 py-2 -mx-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {/* Date block */}
                        <div className="flex-shrink-0 w-10 text-center">
                          <div className="text-[10px] font-medium tracking-wider text-muted-foreground">
                            {month}
                          </div>
                          <div className="text-lg font-semibold tabular-nums leading-tight">
                            {day}
                          </div>
                        </div>

                        {/* Ride details */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                            {ride.name}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                            {ride.distance} km
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
