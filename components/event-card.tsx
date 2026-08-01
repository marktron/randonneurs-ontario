import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { devData } from '@/lib/dev-data'
import { buildRwgpsCollectionUrl } from '@/lib/rwgps'

export interface Event {
  id?: string // Event UUID for debugging
  slug: string // Event slug for registration link
  date: string // ISO date string
  name: string
  type: 'Populaire' | 'Brevet' | 'Fleche' | 'Permanent'
  distance: string
  startLocation: string
  startTime: string // HH:MM format
  status: 'scheduled' | 'cancelled' // Drives cancelled-event rendering
  registeredCount?: number // Number of registered riders
  chapterName?: string // Chapter name for all-chapters view
  rwgpsId?: string | null // RideWithGPS route ID for route link
  rwgpsCollectionId?: string | null // RWGPS collection ID for multi-leg events
}

function formatDate(dateString: string): {
  dayOfWeek: string
  shortDayOfWeek: string
  month: string
  monthShort: string
  day: string
  year: string
} {
  const date = new Date(dateString + 'T00:00:00')
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })
  const shortDayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' })
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const monthShort = date.toLocaleDateString('en-US', { month: 'short' })
  const day = date.getDate().toString()
  const year = date.getFullYear().toString()
  return { dayOfWeek, shortDayOfWeek, month, monthShort, day, year }
}

/**
 * Tailwind text-colour class for a brevet distance, matching its ACP medal.
 * Populaires and any non-standard distance return null so the caller keeps
 * its existing (muted) styling.
 */
export function distanceMedalColorClass(distance: string): string | null {
  const km = parseInt(distance, 10)
  if (Number.isNaN(km)) return null
  if (km >= 1000) return 'text-neutral-900 dark:text-neutral-100'
  switch (km) {
    case 200:
      return 'text-yellow-600 dark:text-yellow-400'
    case 300:
      return 'text-lime-600 dark:text-lime-400'
    case 400:
      return 'text-purple-600 dark:text-purple-400'
    case 600:
      return 'text-orange-600 dark:text-orange-400'
    default:
      return null
  }
}

/**
 * Tailwind background + text classes for a solid ACP-medal-coloured chip
 * (used by the grid view, where the whole event cell is filled with the medal
 * colour and rendered with light text). Populaires and any non-standard
 * distance return null so the caller keeps its default muted styling.
 */
export function distanceMedalCellClass(distance: string): string | null {
  const km = parseInt(distance, 10)
  if (Number.isNaN(km)) return null
  if (km >= 1000) return 'bg-neutral-900 text-white'
  switch (km) {
    case 200:
      return 'bg-yellow-600 text-white'
    case 300:
      return 'bg-lime-600 text-white'
    case 400:
      return 'bg-purple-600 text-white'
    case 600:
      return 'bg-orange-600 text-white'
    default:
      return null
  }
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes}${ampm}`
}

export function EventCard({
  event,
  showDate = true,
  showBorder = true,
}: {
  event: Event
  showDate?: boolean
  showBorder?: boolean
}) {
  const { dayOfWeek, shortDayOfWeek, month, monthShort, day } = formatDate(event.date)
  const isCancelled = event.status === 'cancelled'

  return (
    <article
      {...devData('events', event.id)}
      className={`group relative sm:grid sm:grid-cols-[6rem_1fr] sm:gap-10 ${showDate ? 'pt-6 sm:pt-8' : 'pt-8 sm:pt-4'} ${showBorder ? 'border-b border-border/60 pb-6 sm:pb-8' : ''}`}
    >
      {/* Date block - visible on sm+ (stays full color even when cancelled) */}
      <div className="hidden sm:block text-center">
        {showDate ? (
          <>
            <div className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground">
              {month}
            </div>
            <div className="text-5xl font-serif tabular-nums leading-none mt-1">{day}</div>
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground mt-2">
              {dayOfWeek}
            </div>
          </>
        ) : (
          <div className="invisible">
            <div className="text-[11px]">&nbsp;</div>
            <div className="text-5xl mt-1">&nbsp;</div>
            <div className="text-[11px] mt-2">&nbsp;</div>
          </div>
        )}
      </div>

      {/* Event details */}
      <div className={`min-w-0 flex flex-col justify-center ${isCancelled ? 'opacity-60' : ''}`}>
        {/* Inline date - mobile only */}
        {showDate && (
          <div className="sm:hidden text-xs font-medium tracking-wide text-muted-foreground mb-2">
            {shortDayOfWeek}, {monthShort} {day}
          </div>
        )}
        {event.chapterName && (
          <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
            {event.chapterName}
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl leading-tight sm:text-2xl">
            <Link
              href={`/register/${event.slug}`}
              className="hover:text-primary transition-colors border-b border-transparent group-hover:border-current/50"
            >
              {event.name}
            </Link>
          </h3>
          <span
            className={`text-sm tabular-nums ${distanceMedalColorClass(event.distance) ?? 'text-muted-foreground'}`}
          >
            {event.distance} km
          </span>
          {event.type === 'Populaire' && (
            <Badge variant="outline" className="text-[10px] tracking-wider font-medium">
              Populaire
            </Badge>
          )}
          {isCancelled && (
            <Badge variant="destructive" className="text-[10px] tracking-wider font-medium">
              Cancelled
            </Badge>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{formatTime(event.startTime)}</span>
          {event.startLocation && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span>{event.startLocation}</span>
            </>
          )}
          {event.registeredCount !== undefined && event.registeredCount > 0 && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span>
                {event.registeredCount} {event.registeredCount === 1 ? 'rider' : 'riders'}
              </span>
            </>
          )}
        </div>

        <div className="mt-3 md:mt-0 md:absolute md:right-0 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity flex items-center gap-2">
          {(event.rwgpsId || event.rwgpsCollectionId) && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={
                  event.rwgpsId
                    ? `https://ridewithgps.com/routes/${event.rwgpsId}`
                    : buildRwgpsCollectionUrl(event.rwgpsCollectionId!)
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Route
              </a>
            </Button>
          )}
          {!isCancelled && (
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" asChild>
              <Link href={`/register/${event.slug}`}>Register</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function EventList({ events }: { events: Event[] }) {
  // Group events by month
  const eventsByMonth = events.reduce(
    (acc, event) => {
      const date = new Date(event.date + 'T00:00:00')
      const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!acc[monthKey]) {
        acc[monthKey] = []
      }
      acc[monthKey].push(event)
      return acc
    },
    {} as Record<string, Event[]>
  )

  return (
    <div className="space-y-10 sm:space-y-16">
      {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
        <section key={month}>
          <header className="mb-2">
            <h2 className="font-serif text-2xl tracking-tight">{month}</h2>
          </header>
          <div>
            {monthEvents.map((event, index) => {
              const prevEvent = index > 0 ? monthEvents[index - 1] : null
              const nextEvent = index < monthEvents.length - 1 ? monthEvents[index + 1] : null
              const showDate = !prevEvent || prevEvent.date !== event.date
              const showBorder = !nextEvent || nextEvent.date !== event.date
              return (
                <EventCard
                  key={`${event.date}-${event.distance}-${index}`}
                  event={event}
                  showDate={showDate}
                  showBorder={showBorder}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
