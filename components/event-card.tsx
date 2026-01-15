import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { devData } from '@/lib/dev-data'

export interface Event {
  id?: string // Event UUID for debugging
  slug: string // Event slug for registration link
  date: string // ISO date string
  name: string
  type: 'Populaire' | 'Brevet' | 'Fleche' | 'Permanent'
  distance: string
  startLocation: string
  startTime: string // HH:MM format
  registeredCount?: number // Number of registered riders
}

function formatDate(dateString: string): {
  dayOfWeek: string
  month: string
  day: string
  year: string
} {
  const date = new Date(dateString + 'T00:00:00')
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate().toString()
  const year = date.getFullYear().toString()
  return { dayOfWeek, month, day, year }
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
  const { dayOfWeek, month, day } = formatDate(event.date)

  return (
    <article
      {...devData('events', event.id)}
      className={`group relative grid grid-cols-[4.5rem_1fr] gap-6 sm:grid-cols-[6rem_1fr] sm:gap-10 ${showDate ? 'pt-8' : 'pt-4'} ${showBorder ? 'border-b border-border pb-8' : ''}`}
    >
      {/* Date block */}
      <div className="text-center">
        {showDate ? (
          <>
            <div className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground">
              {month}
            </div>
            <div className="text-4xl font-serif tabular-nums leading-none mt-1 sm:text-5xl">
              {day}
            </div>
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground mt-2 hidden sm:block">
              {dayOfWeek}
            </div>
          </>
        ) : (
          <div className="invisible">
            <div className="text-[11px]">&nbsp;</div>
            <div className="text-4xl mt-1 sm:text-5xl">&nbsp;</div>
          </div>
        )}
      </div>

      {/* Event details */}
      <div className="min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl leading-tight sm:text-2xl">
            <Link
              href={`/register/${event.slug}`}
              className="hover:text-primary transition-colors border-b border-transparent group-hover:border-current/50"
            >
              {event.name}
            </Link>
          </h3>
          <span className="text-sm tabular-nums text-muted-foreground">{event.distance} km</span>
          {event.type === 'Populaire' && (
            <Badge variant="outline" className="text-[10px] tracking-wider font-medium">
              Populaire
            </Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {event.startLocation && (
            <>
              <span>{event.startLocation}</span>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
            </>
          )}
          <span className="tabular-nums">{formatTime(event.startTime)}</span>
          {event.registeredCount !== undefined && event.registeredCount > 0 && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span>
                {event.registeredCount} {event.registeredCount === 1 ? 'rider' : 'riders'}
              </span>
            </>
          )}
        </div>

        <div className="mt-4 md:mt-0 md:absolute md:right-0 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
          <Button variant="default" size="sm" asChild>
            <Link href={`/register/${event.slug}`}>Register</Link>
          </Button>
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
    <div className="space-y-16">
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
