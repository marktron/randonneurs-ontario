import type { Event } from '@/components/event-card'
import { getAcpTimeLimitMinutes } from '@/lib/events/finish-time'
import { parseLocalDate } from '@/lib/utils'

const MINUTES_PER_DAY = 24 * 60

/** A Flèche is a 24-hour team event; its limit does not come from the distance table. */
const FLECHE_LIMIT_MIN = 24 * 60

/** "HH:MM", or the "HH:MM:SS" form Postgres `time` columns arrive in. */
const START_TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

/**
 * One rendered piece of an event inside a single Mon–Sun calendar week.
 *
 * A ride that runs past Sunday (or past the end of the displayed month) is cut
 * into several segments — one per week/month grid it appears in — each carrying
 * flags so the renderer can flatten the corner on the side that continues.
 */
export interface EventSegment {
  event: Event
  /** Column the bar starts in, 0 = Monday. */
  colStart: number
  /** Number of columns the bar covers within this week. */
  colSpan: number
  /** The ride started before this segment's first column. */
  continuesBefore: boolean
  /** The ride runs past this segment's last column. */
  continuesAfter: boolean
  /** Total days the ride covers, across all weeks. */
  spanDays: number
}

/** Local YYYY-MM-DD key for a Date, matching the calendar's other date handling. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Minutes past local midnight for an "HH:MM" start time, or null if unusable. */
function parseStartMinutes(startTime: string | null | undefined): number | null {
  const match = startTime?.match(START_TIME_RE)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Strict ACP elapsed-time limit for the event, in minutes.
 *
 * Populaires (under 200 km) have no ACP limit — `getNominalDistance()` would
 * round them up to the 200 km band, which would be wrong here — so they return
 * null and are treated as single-day rides.
 */
export function getEventLimitMinutes(event: Event): number | null {
  if (event.type === 'Fleche') return FLECHE_LIMIT_MIN
  const km = Number.parseInt(event.distance, 10)
  if (!Number.isFinite(km) || km < 200) return null
  return getAcpTimeLimitMinutes(km)
}

/** The limit as a compact label for the bar's second line, e.g. "40h", "13h30m". */
export function getEventLimitLabel(event: Event): string | null {
  const minutes = getEventLimitMinutes(event)
  if (minutes === null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}m`
}

/**
 * Calendar days the ride covers, from its start date through the day its strict
 * ACP cutoff falls on. Deliberately does NOT add the extra grace day that
 * `getFinishDayOptions()` offers — the calendar shows the official window.
 */
export function getEventSpanDays(event: Event): number {
  const limitMinutes = getEventLimitMinutes(event)
  if (limitMinutes === null) return 1
  const startMinutes = parseStartMinutes(event.startTime)
  if (startMinutes === null) return 1
  // A cutoff landing exactly on midnight is the end of the previous day, not
  // the first minute of the next one, hence the `- 1`.
  return Math.floor((startMinutes + limitMinutes - 1) / MINUTES_PER_DAY) + 1
}

/** Local date keys for every day the ride covers, in order. */
export function getEventDayKeys(event: Event): string[] {
  const span = getEventSpanDays(event)
  const start = parseLocalDate(event.date)
  const keys: string[] = []
  for (let i = 0; i < span; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    keys.push(toDateKey(d))
  }
  return keys
}

/** Last local date key the ride covers. */
export function getEventEndDateKey(event: Event): string {
  const keys = getEventDayKeys(event)
  return keys[keys.length - 1]
}

/**
 * Every month the ride appears in — the month it starts in plus any month it
 * continues into, so a May 31 600 also gets drawn on the June grid.
 */
export function getEventMonthKeys(event: Event): { year: number; month: number }[] {
  const seen = new Set<string>()
  const months: { year: number; month: number }[] = []
  for (const key of getEventDayKeys(event)) {
    const date = parseLocalDate(key)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    if (seen.has(monthKey)) continue
    seen.add(monthKey)
    months.push({ year: date.getFullYear(), month: date.getMonth() })
  }
  return months
}

/**
 * Lay the events that touch one Mon–Sun week out as bars, packed into lanes.
 *
 * `week` is a row from the month grid: seven entries, where `null` is a padding
 * cell outside the displayed month. Bars are clipped to the non-null cells, so
 * a ride crossing a month boundary is drawn on both months with the appropriate
 * `continuesBefore` / `continuesAfter` flag.
 *
 * Events are laid out in a stable order — earlier start date first, then longer
 * span, then source order — and each takes the first lane whose columns are all
 * free, so a short ride can slot back into lane 0 once a bar above it has ended.
 */
export function buildWeekLanes(week: (Date | null)[], events: Event[]): EventSegment[][] {
  const columnKeys = week.map((date) => (date ? toDateKey(date) : null))
  if (columnKeys.every((key) => key === null)) return []

  const ordered = events
    .map((event, index) => ({
      event,
      index,
      startKey: event.date,
      endKey: getEventEndDateKey(event),
      spanDays: getEventSpanDays(event),
    }))
    .sort(
      (a, b) => a.startKey.localeCompare(b.startKey) || b.spanDays - a.spanDays || a.index - b.index
    )

  const lanes: EventSegment[][] = []
  const occupied: boolean[][] = []

  for (const item of ordered) {
    let colStart = -1
    let colEnd = -1
    for (let col = 0; col < columnKeys.length; col++) {
      const key = columnKeys[col]
      if (key === null) continue
      if (key < item.startKey || key > item.endKey) continue
      if (colStart === -1) colStart = col
      colEnd = col
    }
    if (colStart === -1) continue

    const segment: EventSegment = {
      event: item.event,
      colStart,
      colSpan: colEnd - colStart + 1,
      continuesBefore: item.startKey < (columnKeys[colStart] as string),
      continuesAfter: item.endKey > (columnKeys[colEnd] as string),
      spanDays: item.spanDays,
    }

    let lane = 0
    while (lane < lanes.length) {
      const row = occupied[lane]
      let fits = true
      for (let col = colStart; col <= colEnd; col++) {
        if (row[col]) {
          fits = false
          break
        }
      }
      if (fits) break
      lane++
    }
    if (lane === lanes.length) {
      lanes.push([])
      occupied.push(new Array(7).fill(false))
    }
    lanes[lane].push(segment)
    for (let col = colStart; col <= colEnd; col++) occupied[lane][col] = true
  }

  return lanes
}
