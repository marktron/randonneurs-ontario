import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendCardReminderEmail } from '@/lib/email/send-card-reminder-email'
import type { EventForCardReminder } from '@/lib/email/send-card-reminder-email'
import { DIGITAL_CARD_EVENT_TYPES, resolveRiderStart } from '@/lib/brevet-card'
import { torontoDateString } from '@/lib/brmTimes'
import type { RegistrationUpdate } from '@/types/queries'

/** How long before a rider's start the reminder goes out. */
export const CARD_REMINDER_LEAD_MS = 12 * 60 * 60 * 1000

const CANDIDATE_SELECT =
  'id, event_id, management_token, registered_at, pre_ride_date, pre_ride_start_time, ' +
  'riders(id, first_name, last_name, email), ' +
  'events!inner(id, name, event_date, start_time, distance_km, event_type, status, start_location, chapters(name, slug))'

interface CardReminderRegistrationRow {
  id: string
  event_id: string
  management_token: string | null
  registered_at: string | null
  pre_ride_date: string | null
  pre_ride_start_time: string | null
  /**
   * Not embedded with `!inner`: `registrations.rider_id` is NOT NULL behind an
   * FK, so the embed resolves for every real row. Keeping it nullable means a
   * candidate with a broken rider link surfaces as a `noEmail` skip in the
   * cron response instead of silently vanishing from the query.
   */
  riders: { id: string; first_name: string; last_name: string; email: string | null } | null
  /** Non-null: `events!inner` drops the registration when the event doesn't match. */
  events: EventForCardReminder
}

export interface CardReminderSweepResult {
  /** Candidate registrations returned by the query. */
  checked: number
  sent: number
  /** Registrations skipped, by reason, for the cron response. */
  skipped: {
    notInWindow: number
    lateSignup: number
    noControls: number
    noEmail: number
    alreadyClaimed: number
  }
  errors: string[]
}

/**
 * Sends the digital brevet card reminder to every rider whose start is within
 * the next 12 hours. Driven by the reminder cron, so it must be safe to run
 * repeatedly: each row is claimed by stamping `card_reminder_sent_at` while it
 * is still NULL, and a rider whose claim loses that race is skipped rather
 * than emailed twice. A send that fails after the claim is a missed email, not
 * a duplicate — the same trade the result-submission flow makes.
 */
export async function sendCardReminders(now: Date = new Date()): Promise<CardReminderSweepResult> {
  const supabase = getSupabaseAdmin()
  const result: CardReminderSweepResult = {
    checked: 0,
    sent: 0,
    skipped: { notInWindow: 0, lateSignup: 0, noControls: 0, noEmail: 0, alreadyClaimed: 0 },
    errors: [],
  }

  // Coarse prune only — a pre-ride start can precede the event date, and the
  // real window check happens per registration below.
  const earliestEventDate = torontoDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const { data, error } = await supabase
    .from('registrations')
    .select(CANDIDATE_SELECT)
    .eq('status', 'registered')
    .eq('brevet_card_type', 'digital')
    .is('card_reminder_sent_at', null)
    .eq('events.status', 'scheduled')
    .in('events.event_type', [...DIGITAL_CARD_EVENT_TYPES])
    .gte('events.event_date', earliestEventDate)

  if (error) {
    result.errors.push(`Failed to fetch card reminder candidates: ${error.message}`)
    return result
  }

  const registrations = (data || []) as unknown as CardReminderRegistrationRow[]
  result.checked = registrations.length
  if (registrations.length === 0) return result

  // A card with no controls has nothing to check in at, so the reminder would
  // link riders to an unusable page.
  const eventIds = [...new Set(registrations.map((reg) => reg.event_id))]
  const { data: controlRows, error: controlsError } = await supabase
    .from('event_controls')
    .select('event_id')
    .in('event_id', eventIds)

  if (controlsError) {
    result.errors.push(`Failed to fetch event controls: ${controlsError.message}`)
    return result
  }

  const eventsWithControls = new Set(
    ((controlRows || []) as { event_id: string }[]).map((row) => row.event_id)
  )

  for (const reg of registrations) {
    const event = reg.events
    const riderStart = resolveRiderStart(event, reg)
    const sendAt = new Date(riderStart.getTime() - CARD_REMINDER_LEAD_MS)

    if (now < sendAt || now >= riderStart) {
      result.skipped.notInWindow++
      continue
    }

    // Someone who signed up inside the reminder window already has the card
    // link in their fresh confirmation email; a reminder minutes later is noise.
    if (reg.registered_at !== null && new Date(reg.registered_at) >= sendAt) {
      result.skipped.lateSignup++
      continue
    }

    if (!eventsWithControls.has(reg.event_id)) {
      result.skipped.noControls++
      continue
    }

    const rider = reg.riders
    if (!rider?.email || !reg.management_token) {
      result.skipped.noEmail++
      continue
    }

    const { data: claimed, error: claimError } = await supabase
      .from('registrations')
      .update({ card_reminder_sent_at: now.toISOString() } as RegistrationUpdate)
      .eq('id', reg.id)
      .is('card_reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    if (claimError) {
      result.errors.push(
        `Failed to claim card reminder for registration ${reg.id}: ${claimError.message}`
      )
      continue
    }
    if (!claimed) {
      result.skipped.alreadyClaimed++
      continue
    }

    const riderName = `${rider.first_name} ${rider.last_name}`
    const { sent, error: sendError } = await sendCardReminderEmail({
      event,
      riderName,
      riderEmail: rider.email,
      managementToken: reg.management_token,
      riderStart,
    })

    if (sent) {
      result.sent++
      console.log(`Sent digital card reminder for ${event.name} (registration ${reg.id})`)
    }
    if (sendError) {
      result.errors.push(
        `Failed to send card reminder to ${riderName} for ${event.name}: ${sendError}`
      )
    }
  }

  return result
}
