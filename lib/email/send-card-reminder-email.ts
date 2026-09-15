import { buildCardReminderEmail } from '@/lib/email/templates'
import { sendEventFlowEmail } from '@/lib/email/send-result-flow-email'
import { buildDigitalCardUrl } from '@/lib/actions/registration/helpers'
import { TORONTO_TZ } from '@/lib/brmTimes'

export interface EventForCardReminder {
  id: string
  name: string
  event_date: string
  start_time: string | null
  distance_km: number
  event_type: string | null
  status: string
  start_location: string | null
  chapters: { name: string; slug: string } | null
}

/** e.g. "Saturday, June 6, 2026" — the rider's start day in Toronto time. */
function formatTorontoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    timeZone: TORONTO_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** e.g. "7:00 AM" — the rider's start time in Toronto time. */
function formatTorontoTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: TORONTO_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Builds and sends the digital brevet card reminder for one rider, with the
 * chapter VP as reply-to. Every displayed date and time comes from
 * `riderStart`, so a pre-ride rider sees their own approved start rather than
 * the event's scheduled one.
 */
export async function sendCardReminderEmail(params: {
  event: EventForCardReminder
  riderName: string
  riderEmail: string
  managementToken: string
  /** The rider's resolved start (event start or approved pre-ride start). */
  riderStart: Date
  /**
   * Whether `riderStart` carries a real clock time. `computeEventStart` falls
   * back to midnight when no start time is set, and midnight is also a
   * legitimate pre-ride start, so only the caller can tell the two apart:
   * the registration has a start time when either the event's `start_time` or
   * the registration's `pre_ride_start_time` is set.
   */
  startTimeKnown: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const { event, riderStart } = params

  const { subject, text, html } = buildCardReminderEmail({
    riderName: params.riderName,
    eventName: event.name,
    eventDistance: event.distance_km,
    eventDate: formatTorontoDate(riderStart),
    eventTime: params.startTimeKnown ? formatTorontoTime(riderStart) : 'TBD',
    eventLocation: event.start_location ?? 'TBD',
    chapterName: event.chapters?.name || 'Randonneurs Ontario',
    cardUrl: buildDigitalCardUrl(params.managementToken),
  })

  return sendEventFlowEmail({
    event,
    to: params.riderEmail,
    subject,
    text,
    html,
    emailKind: 'card reminder',
  })
}
