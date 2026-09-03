'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { distanceMedalCellClass, type Event } from '@/components/event-card'
import {
  buildWeekLanes,
  getEventDayKeys,
  getEventLimitLabel,
  getEventMonthKeys,
  getEventSpanDays,
  toDateKey,
  type EventSegment,
} from '@/lib/calendar/event-spans'
import { parseLocalDate } from '@/lib/utils'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Height of the day-number band at the top of each week row. */
const DAY_NUMBER_ROW = '1.75rem'

interface WeekRow {
  days: (Date | null)[]
  /** Bars for this week, packed into lanes (one rendered grid row each). */
  lanes: EventSegment[][]
  /**
   * Events to list once in the mobile detail rows under this week — the ones
   * that start here, plus (in week 0) any that continued in from last month.
   */
  listed: { event: Event; date: Date }[]
}

interface MonthGrid {
  label: string
  year: number
  month: number
  weeks: WeekRow[]
  /** Local day key → every event covering that day, spans included. */
  eventsByDay: Map<string, Event[]>
}

function buildMonthGrids(events: Event[]): MonthGrid[] {
  if (events.length === 0) return []

  // A ride whose ACP limit runs past midnight also belongs to the month(s) it
  // continues into, so a May 31 600 gets a June grid showing its Monday tail.
  const monthSet = new Set<string>()
  for (const event of events) {
    for (const { year, month } of getEventMonthKeys(event)) {
      monthSet.add(`${year}-${month}`)
    }
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

    const weekDays: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = new Array(startDow).fill(null)

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(new Date(year, month, day))
      if (currentWeek.length === 7) {
        weekDays.push(currentWeek)
        currentWeek = []
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null)
      weekDays.push(currentWeek)
    }

    // Every event that touches this month, on every day it covers. Keys are
    // local (`toDateKey`) so lookups here and in the renderer agree.
    const eventsByDay = new Map<string, Event[]>()
    const monthEvents: Event[] = []
    const firstKey = toDateKey(firstDay)
    const lastKey = toDateKey(new Date(year, month, daysInMonth))

    for (const event of events) {
      const dayKeys = getEventDayKeys(event).filter((key) => key >= firstKey && key <= lastKey)
      if (dayKeys.length === 0) continue
      monthEvents.push(event)
      for (const key of dayKeys) {
        const existing = eventsByDay.get(key) || []
        existing.push(event)
        eventsByDay.set(key, existing)
      }
    }

    const weeks: WeekRow[] = weekDays.map((days, wi) => {
      const dayKeys = days.filter((d): d is Date => d !== null).map(toDateKey)
      const weekFirst = dayKeys[0]
      const weekLast = dayKeys[dayKeys.length - 1]

      const listed: { event: Event; date: Date }[] = []
      for (const event of monthEvents) {
        if (weekFirst && event.date >= weekFirst && event.date <= weekLast) {
          // Starts this week — list it on its start day.
          listed.push({ event, date: parseLocalDate(event.date) })
        } else if (wi === 0 && event.date < firstKey) {
          // Continued in from a previous month — list it on the first day of
          // this month, which is always in week 0.
          listed.push({ event, date: firstDay })
        }
      }
      listed.sort(
        (a, b) => a.date.getTime() - b.date.getTime() || a.event.name.localeCompare(b.event.name)
      )

      return { days, lanes: buildWeekLanes(days, monthEvents), listed }
    })

    const label = firstDay.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })

    return { label, year, month, weeks, eventsByDay }
  })
}

/**
 * Flatten lanes into DOM order by start column, then lane. Grid placement is
 * explicit, so this only affects tab order — keyboard focus walks the week by
 * date rather than lane by lane.
 */
function orderByDay(lanes: EventSegment[][]): { segment: EventSegment; lane: number }[] {
  return lanes
    .flatMap((lane, li) => lane.map((segment) => ({ segment, lane: li })))
    .sort((a, b) => a.segment.colStart - b.segment.colStart || a.lane - b.lane)
}

function formatTime(time: string): string {
  const [hours, minutes] = (time ?? '').split(':')
  const hour = parseInt(hours, 10)
  if (Number.isNaN(hour) || minutes === undefined) return ''
  const ampm = hour >= 12 ? 'pm' : 'am'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes}${ampm}`
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function eventLinkLabel(event: Event, date: Date, spanDays = 1): string {
  // Screen readers get the same draft/cancelled cue the chip gives sighted users.
  const state = event.status === 'draft' || event.status === 'cancelled' ? `, ${event.status}` : ''
  const time = formatTime(event.startTime)
  const timePart = time ? `, ${time}` : ''
  // Multi-day bars announce how long the ride runs and under what limit, so the
  // span a sighted user reads off the bar is not lost.
  const limitLabel = getEventLimitLabel(event)
  const spanPart =
    spanDays > 1 ? `, ${spanDays} days${limitLabel ? ` (${limitLabel} limit)` : ''}` : ''
  return `${event.name}, ${event.distance} km, ${formatDateLong(date)}${timePart}${spanPart}${event.chapterName ? `, ${event.chapterName}` : ''}${state}`
}

interface CalendarGridViewProps {
  events: Event[]
  /** Builds each event's link. Defaults to the public registration page. */
  hrefFor?: (event: Event) => string
}

const defaultHrefFor = (event: Event) => `/register/${event.slug}`

export function CalendarGridView({ events, hrefFor = defaultHrefFor }: CalendarGridViewProps) {
  const grids = useMemo(() => buildMonthGrids(events), [events])
  const todayKey = useMemo(() => toDateKey(new Date()), [])

  return (
    <div className="space-y-12 sm:space-y-16">
      {grids.map((grid) => (
        <section key={`${grid.year}-${grid.month}`}>
          <header className="mb-4">
            <h2 className="font-serif text-2xl tracking-tight">{grid.label}</h2>
          </header>

          {/* Desktop grid: one CSS grid per week so multi-day rides can span columns.
              No ARIA grid role: spanning bars can't map onto a 7-cell row model and
              there is no arrow-key navigation, so each bar's link label carries the
              full date instead. */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 border-b border-border/60">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  aria-hidden="true"
                  className="py-2 text-center text-[11px] font-medium tracking-[0.15em] text-muted-foreground uppercase"
                >
                  {day}
                </div>
              ))}
            </div>
            {grid.weeks.map((week, wi) => {
              const laneCount = week.lanes.length
              return (
                <div
                  key={wi}
                  className="grid grid-cols-7 min-h-[5.5rem] border-b border-border/40"
                  style={{
                    // A trailing 1fr row lets the day cells (which span every
                    // row) fill the week's minimum height.
                    gridTemplateRows:
                      laneCount > 0
                        ? `${DAY_NUMBER_ROW} repeat(${laneCount}, auto) 1fr`
                        : `${DAY_NUMBER_ROW} 1fr`,
                  }}
                >
                  {week.days.map((date, di) => {
                    const isToday = date && toDateKey(date) === todayKey
                    return (
                      <div
                        key={di}
                        aria-current={isToday ? 'date' : undefined}
                        style={{ gridColumn: di + 1, gridRow: '1 / -1' }}
                        className={`${di < 6 ? 'border-r border-border/30' : ''} ${
                          date ? 'bg-background' : 'bg-muted/30'
                        }`}
                      >
                        {date && (
                          <div
                            className={`px-1.5 pt-1 text-sm leading-tight tabular-nums ${
                              isToday ? 'font-semibold text-primary' : 'text-muted-foreground'
                            }`}
                          >
                            {date.getDate()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {orderByDay(week.lanes).map(({ segment, lane }) => (
                    <div
                      key={`${lane}-${segment.colStart}`}
                      data-col-start={segment.colStart + 1}
                      data-col-span={segment.colSpan}
                      style={{
                        gridColumn: `${segment.colStart + 1} / span ${segment.colSpan}`,
                        gridRow: lane + 2,
                      }}
                      className="min-w-0 px-1 pb-1"
                    >
                      <EventBar event={segment.event} segment={segment} hrefFor={hrefFor} />
                    </div>
                  ))}
                </div>
              )
            })}
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
            {grid.weeks.map((week, wi) => (
              <div key={wi}>
                <div className="grid grid-cols-7 border-b border-border/30">
                  {week.days.map((date, di) => {
                    // Dots mark every day a ride covers, not just its start.
                    const dayEvents = date ? grid.eventsByDay.get(toDateKey(date)) : undefined
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
                                          : event.status === 'draft'
                                            ? 'bg-muted-foreground'
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
                {week.listed.length > 0 && (
                  <div className="border-b border-border/30 bg-muted/30 py-1.5 px-3 space-y-0.5">
                    {week.listed.map(({ event, date }, ei) => {
                      const spanDays = getEventSpanDays(event)
                      const continuedIn = toDateKey(date) !== event.date
                      const dayAbbr = date.toLocaleDateString('en-US', { weekday: 'short' })
                      const isCancelled = event.status === 'cancelled'
                      const isDraft = event.status === 'draft'
                      return (
                        <Link
                          key={`${toDateKey(date)}-${ei}`}
                          href={hrefFor(event)}
                          aria-label={eventLinkLabel(event, parseLocalDate(event.date), spanDays)}
                          className={`flex items-center gap-2 text-sm py-1.5 -mx-1 px-1 rounded ${
                            isCancelled ? 'opacity-60' : 'active:bg-muted/50'
                          }`}
                        >
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-center">
                            {dayAbbr} {date.getDate()}
                          </span>
                          <span className="font-medium truncate min-w-0">
                            {continuedIn && (
                              <span aria-hidden="true" className="mr-1 text-muted-foreground">
                                ↵
                              </span>
                            )}
                            {event.name}
                            {isCancelled && (
                              <span className="ml-1 font-normal text-muted-foreground">
                                (cancelled)
                              </span>
                            )}
                            {isDraft && (
                              <span className="ml-1 font-normal text-muted-foreground">
                                (draft)
                              </span>
                            )}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] tracking-wider shrink-0 ml-auto ${
                              isCancelled || isDraft
                                ? 'border-dashed'
                                : (distanceMedalCellClass(event.distance) ?? '')
                            }`}
                          >
                            {event.distance} km
                          </Badge>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

interface EventBarProps {
  event: Event
  segment: EventSegment
  hrefFor: (event: Event) => string
}

/** One chip/bar in the desktop grid. Multi-day rides keep the same visual
 *  language; only the corners on a continuing side are flattened. */
function EventBar({ event, segment, hrefFor }: EventBarProps) {
  const isCancelled = event.status === 'cancelled'
  const isDraft = event.status === 'draft'
  const medalCell = isCancelled || isDraft ? null : distanceMedalCellClass(event.distance)
  const { continuesBefore, continuesAfter, spanDays } = segment
  const limitLabel = spanDays > 1 ? getEventLimitLabel(event) : null
  const time = formatTime(event.startTime)

  return (
    <Link
      href={hrefFor(event)}
      aria-label={eventLinkLabel(event, parseLocalDate(event.date), spanDays)}
      className="block"
    >
      <div
        className={`rounded px-1.5 py-1 text-[11px] leading-tight border ${
          continuesBefore ? 'rounded-l-none' : ''
        } ${continuesAfter ? 'rounded-r-none' : ''} ${
          isCancelled
            ? 'border-border/40 bg-muted/40 opacity-60'
            : isDraft
              ? 'border-dashed border-border bg-background text-muted-foreground hover:bg-muted/50 transition-colors'
              : medalCell
                ? `border-transparent ${medalCell} hover:opacity-90 transition-opacity`
                : 'border-border/40 bg-muted/70 hover:bg-muted transition-colors'
        }`}
      >
        <div className="font-medium truncate">
          {continuesBefore && (
            <span aria-hidden="true" className="mr-1">
              ↵
            </span>
          )}
          {event.distance} km — {event.name}
          {isCancelled && (
            <span className="ml-1 font-normal text-muted-foreground">(cancelled)</span>
          )}
          {isDraft && (
            <span className="ml-1 font-normal uppercase tracking-wider text-[9px]">Draft</span>
          )}
        </div>
        <div className={`mt-0.5 truncate ${medalCell ? 'text-white/80' : 'text-muted-foreground'}`}>
          {time}
          {limitLabel && `${time ? ' · ' : ''}${limitLabel} limit`}
          {event.chapterName && ` · ${event.chapterName}`}
        </div>
      </div>
    </Link>
  )
}
