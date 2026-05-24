import { useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Event } from '@/components/event-card'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGrid {
  label: string
  year: number
  month: number
  weeks: (Date | null)[][]
  events: Map<string, Event[]>
}

function buildMonthGrids(events: Event[]): MonthGrid[] {
  if (events.length === 0) return []

  // Collect all unique year-month combos from events
  const monthSet = new Set<string>()
  for (const event of events) {
    const date = new Date(event.date + 'T00:00:00')
    monthSet.add(`${date.getFullYear()}-${date.getMonth()}`)
  }

  const months = Array.from(monthSet)
    .map((key) => {
      const [year, month] = key.split('-').map(Number)
      return { year, month }
    })
    .sort((a, b) => a.year - b.year || a.month - b.month)

  return months.map(({ year, month }) => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // Monday = 0, Sunday = 6 (ISO week)
    const startDow = (firstDay.getDay() + 6) % 7

    const weeks: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = new Array(startDow).fill(null)

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(new Date(year, month, day))
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null)
      weeks.push(currentWeek)
    }

    // Map events to date keys
    const eventMap = new Map<string, Event[]>()
    for (const event of events) {
      const date = new Date(event.date + 'T00:00:00')
      if (date.getFullYear() === year && date.getMonth() === month) {
        const key = date.toISOString().split('T')[0]
        const existing = eventMap.get(key) || []
        existing.push(event)
        eventMap.set(key, existing)
      }
    }

    const label = firstDay.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })

    return { label, year, month, weeks, events: eventMap }
  })
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes}${ampm}`
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function eventLinkLabel(event: Event, date: Date): string {
  return `${event.name}, ${event.distance} km, ${formatDateLong(date)}, ${formatTime(event.startTime)}${event.chapterName ? `, ${event.chapterName}` : ''}`
}

export function CalendarGridView({ events }: { events: Event[] }) {
  const grids = useMemo(() => buildMonthGrids(events), [events])
  const todayKey = useMemo(() => toDateKey(new Date()), [])

  return (
    <div className="space-y-12 sm:space-y-16">
      {grids.map((grid) => (
        <section key={`${grid.year}-${grid.month}`}>
          <header className="mb-4">
            <h2 className="font-serif text-2xl tracking-tight">{grid.label}</h2>
          </header>

          {/* Desktop grid */}
          <div className="hidden sm:block">
            <table
              role="grid"
              aria-label={grid.label}
              className="w-full table-fixed border-collapse"
            >
              <thead>
                <tr className="border-b border-border/60">
                  {DAYS_OF_WEEK.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="py-2 text-center text-[11px] font-medium tracking-[0.15em] text-muted-foreground uppercase"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.weeks.map((week, wi) => (
                  <tr key={wi} className="border-b border-border/40">
                    {week.map((date, di) => {
                      const dayEvents = date ? grid.events.get(toDateKey(date)) : undefined
                      const isToday = date && toDateKey(date) === todayKey
                      return (
                        <td
                          key={di}
                          aria-current={isToday ? 'date' : undefined}
                          className={`h-[5.5rem] align-top p-1.5 border-r last:border-r-0 border-border/30 ${
                            date ? 'bg-background' : 'bg-muted/30'
                          }`}
                        >
                          {date && (
                            <>
                              <div
                                className={`text-sm tabular-nums mb-1 ${
                                  isToday ? 'font-semibold text-primary' : 'text-muted-foreground'
                                }`}
                              >
                                {date.getDate()}
                              </div>
                              {dayEvents?.map((event, ei) => {
                                const isCancelled = event.status === 'cancelled'
                                return (
                                  <Link
                                    key={ei}
                                    href={`/register/${event.slug}`}
                                    aria-label={eventLinkLabel(event, date)}
                                    className="block mb-1 last:mb-0"
                                  >
                                    <div
                                      className={`rounded px-1.5 py-1 text-[11px] leading-tight border border-border/40 ${
                                        isCancelled
                                          ? 'bg-muted/40 opacity-60'
                                          : 'bg-muted/70 hover:bg-muted transition-colors'
                                      }`}
                                    >
                                      <div className="font-medium truncate">
                                        {event.distance} km — {event.name}
                                        {isCancelled && (
                                          <span className="ml-1 font-normal text-muted-foreground">
                                            (cancelled)
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-muted-foreground mt-0.5 truncate">
                                        {formatTime(event.startTime)}
                                        {event.chapterName && ` · ${event.chapterName}`}
                                      </div>
                                    </div>
                                  </Link>
                                )
                              })}
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: compact week rows with event dots */}
          <div className="sm:hidden">
            <div className="grid grid-cols-7 border-b border-border/60">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className="py-1.5 text-center text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase"
                >
                  {day.charAt(0)}
                </div>
              ))}
            </div>
            {grid.weeks.map((week, wi) => {
              // Collect events for this week to show below
              const weekEvents: { date: Date; events: Event[] }[] = []
              for (const date of week) {
                if (!date) continue
                const dayEvents = grid.events.get(toDateKey(date))
                if (dayEvents?.length) {
                  weekEvents.push({ date, events: dayEvents })
                }
              }

              return (
                <div key={wi}>
                  <div className="grid grid-cols-7 border-b border-border/30">
                    {week.map((date, di) => {
                      const dayEvents = date ? grid.events.get(toDateKey(date)) : undefined
                      const hasEvents = dayEvents && dayEvents.length > 0
                      const isToday = date && toDateKey(date) === todayKey
                      return (
                        <div key={di} className={`py-2.5 text-center ${date ? '' : 'bg-muted/20'}`}>
                          {date && (
                            <div className="flex flex-col items-center gap-1">
                              <span
                                aria-current={isToday ? 'date' : undefined}
                                className={`text-sm tabular-nums ${
                                  isToday
                                    ? 'font-semibold text-primary'
                                    : hasEvents
                                      ? 'font-medium text-foreground'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {date.getDate()}
                              </span>
                              {hasEvents && (
                                <>
                                  <div className="flex gap-0.5" aria-hidden="true">
                                    {dayEvents.map((event, ei) => (
                                      <span
                                        key={ei}
                                        className={`w-1 h-1 rounded-full ${
                                          event.status === 'cancelled'
                                            ? 'bg-muted-foreground opacity-60'
                                            : 'bg-primary'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  <span className="sr-only">
                                    {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Event details below week row on mobile */}
                  {weekEvents.length > 0 && (
                    <div className="border-b border-border/30 bg-muted/30 py-1.5 px-3 space-y-0.5">
                      {weekEvents.flatMap(({ date, events: dayEvents }) =>
                        dayEvents.map((event, ei) => {
                          const dayAbbr = date.toLocaleDateString('en-US', {
                            weekday: 'short',
                          })
                          const isCancelled = event.status === 'cancelled'
                          const rowContent = (
                            <>
                              <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-center">
                                {dayAbbr} {date.getDate()}
                              </span>
                              <span className="font-medium truncate min-w-0">
                                {event.name}
                                {isCancelled && (
                                  <span className="ml-1 font-normal text-muted-foreground">
                                    (cancelled)
                                  </span>
                                )}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] tracking-wider shrink-0 ml-auto"
                              >
                                {event.distance} km
                              </Badge>
                            </>
                          )
                          return (
                            <Link
                              key={`${toDateKey(date)}-${ei}`}
                              href={`/register/${event.slug}`}
                              aria-label={eventLinkLabel(event, date)}
                              className={`flex items-center gap-2 text-sm py-1.5 -mx-1 px-1 rounded ${
                                isCancelled ? 'opacity-60' : 'active:bg-muted/50'
                              }`}
                            >
                              {rowContent}
                            </Link>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
