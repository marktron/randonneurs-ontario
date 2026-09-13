import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create a URL-safe slug from a string.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading/trailing hyphens
 * - Truncates to 100 characters
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

export type EventType = 'Brevet' | 'Populaire' | 'Fleche' | 'Permanent'

/**
 * Format database event_type to display type.
 * Converts lowercase db values to title case display values.
 */
export function formatEventType(eventType: string): EventType {
  const typeMap: Record<string, EventType> = {
    brevet: 'Brevet',
    populaire: 'Populaire',
    fleche: 'Fleche',
    permanent: 'Permanent',
  }
  return typeMap[eventType] || 'Brevet'
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local time.
 * Avoids timezone shift issues when using new Date() with date strings.
 */
export function parseLocalDate(dateStr: string): Date {
  // Append T00:00:00 to interpret as local midnight instead of UTC
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Month and weekday name tables and the formatters built on them below are
 * deliberately Intl-free: some browsers (older Safari/WebKit in particular)
 * cannot construct an `Intl.DateTimeFormat` (missing ICU data, an
 * unrecognized system time zone), and any `Date.prototype.toLocaleDateString`
 * call constructs one under the hood. That throws
 * `TypeError: failed to initialize DateTimeFormat`, which can take down an
 * entire page. These tables and helpers reproduce the same English output
 * (`toLocaleDateString('en-US', ...)`) without touching Intl. Use them for
 * any client-rendered date formatting instead of `toLocaleDateString`.
 */
export const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export const WEEKDAY_NAMES_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Intl-free equivalent of `date.toLocaleDateString('en-US', { month: style })`. */
export function monthName(date: Date, style: 'long' | 'short' = 'long'): string {
  return style === 'short' ? MONTH_NAMES_SHORT[date.getMonth()] : MONTH_NAMES_LONG[date.getMonth()]
}

/** Intl-free equivalent of `date.toLocaleDateString('en-US', { weekday: style })`. */
export function weekdayName(date: Date, style: 'long' | 'short' = 'long'): string {
  return style === 'short' ? WEEKDAY_NAMES_SHORT[date.getDay()] : WEEKDAY_NAMES_LONG[date.getDay()]
}

/**
 * Format a YYYY-MM-DD date string as "April 15, 2025" without constructing a
 * Date or touching Intl. A malformed or out-of-range date falls back to the
 * raw string.
 */
export function formatLongDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)
  if (!match) return dateString

  const [, year, month, day] = match
  const name = MONTH_NAMES_LONG[Number(month) - 1]
  if (!name) return dateString

  return `${name} ${Number(day)}, ${year}`
}

/** Format a Date as "April 2025", Intl-free equivalent of `{ month: 'long', year: 'numeric' }`. */
export function formatMonthYear(date: Date): string {
  return `${monthName(date)} ${date.getFullYear()}`
}

/**
 * Format a Date as "Tuesday, April 15", Intl-free equivalent of
 * `{ weekday: 'long', month: 'long', day: 'numeric' }`.
 */
export function formatWeekdayMonthDay(date: Date): string {
  return `${weekdayName(date)}, ${monthName(date)} ${date.getDate()}`
}

/**
 * Format a PostgreSQL interval finish time to HH:MM (stripping seconds).
 * Handles formats like "10:30:00", "105:30:00", or "4 days 09:30:00".
 */
export function formatFinishTime(interval: string | null): string {
  if (!interval) return ''

  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d+):(\d{2})(?::\d{2})?/)
  if (!match) return interval

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + days * 24
  const minutes = match[3]

  return `${hours}:${minutes}`
}

/**
 * Format a PostgreSQL interval finish time as "Xh MM" (e.g., "10h 30").
 * Matches the format used in ACP homologation spreadsheets.
 */
export function formatFinishTimeHm(interval: string | null): string {
  if (!interval) return ''

  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d+):(\d{2})(?::\d{2})?/)
  if (!match) return interval

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + days * 24
  const minutes = match[3]

  return `${hours}h ${minutes}`
}

/**
 * Parse a PostgreSQL interval finish time to total minutes.
 * Used for comparing finish times to find course records.
 * Returns null if the time cannot be parsed.
 */
export function parseFinishTimeToMinutes(interval: string | null): number | null {
  if (!interval) return null

  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d+):(\d{2})(?::\d{2})?/)
  if (!match) return null

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + days * 24
  const minutes = parseInt(match[3], 10)

  return hours * 60 + minutes
}

/**
 * Format a result status for display.
 * Returns null for 'finished' (no badge needed), uppercase for others.
 */
export function formatStatus(status: string): string | null {
  const statusMap: Record<string, string> = {
    dnf: 'DNF',
    dns: 'DNS',
    otl: 'OTL',
    dq: 'DQ',
  }
  if (status === 'finished') return null
  return statusMap[status] || status.toUpperCase()
}

/**
 * Build a mailto: URL with participant emails in BCC and event details in the subject.
 * Filters out participants without email addresses.
 * Returns null if no participants have email addresses.
 */
export function buildParticipantMailtoUrl(
  emails: string[],
  eventName: string,
  eventDate: string
): string | null {
  const validEmails = emails.filter(Boolean)
  if (validEmails.length === 0) return null

  const formattedDate = parseLocalDate(eventDate).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const subject = encodeURIComponent(`${eventName} - ${formattedDate}`)
  const bcc = validEmails.join(',')

  return `mailto:?bcc=${bcc}&subject=${subject}`
}

export interface RiderInfoParticipant {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}

/**
 * Build the plain-text block copied by the admin "Copy rider info" button:
 * an event header followed by each rider's name, email, cell phone, and
 * emergency contact. Contact lines are omitted when the underlying value is
 * absent.
 */
export function buildRiderInfoText(
  participants: RiderInfoParticipant[],
  eventName: string,
  eventDate: string,
  distanceKm: number,
  eventType: string
): string {
  const lines: string[] = [
    `${eventName}`,
    `${eventDate} — ${distanceKm}km ${eventType}`,
    '',
    `Riders (${participants.length})`,
    '—'.repeat(40),
  ]

  for (const p of participants) {
    lines.push(`${p.firstName} ${p.lastName}`)
    if (p.email) lines.push(p.email)
    if (p.phone) lines.push(`Phone: ${p.phone}`)
    if (p.emergencyContactName || p.emergencyContactPhone) {
      const ice = [p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(' ')
      lines.push(`Emergency Contact: ${ice}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
