import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logError } from '@/lib/errors'
import { isEmailConfigured } from '@/lib/email/ses'
import { sendCardReminderEmail } from '@/lib/email/send-card-reminder-email'
import type { EventForCardReminder } from '@/lib/email/send-card-reminder-email'
import { DIGITAL_CARD_EVENT_TYPES, resolveRiderStart } from '@/lib/brevet-card'
import { torontoDateString } from '@/lib/brmTimes'
import type { RegistrationUpdate } from '@/types/queries'
import type { Database } from '@/types/supabase'

/** How long before a rider's start the reminder goes out. */
export const CARD_REMINDER_LEAD_MS = 12 * 60 * 60 * 1000

/**
 * Most candidates one run will look at. This is safe because a row that is not
 * swept this hour is still an unsent candidate next hour: nothing is dropped,
 * it just waits for the next sweep. Without a cap, one badly seeded season
 * could hand the cron an unbounded result set and a request that never
 * finishes inside `maxDuration`.
 */
export const CARD_REMINDER_BATCH_LIMIT = 500

const CANDIDATE_SELECT =
  'id, event_id, management_token, registered_at, pre_ride_date, pre_ride_start_time, ' +
  'riders(id, first_name, last_name, email), ' +
  'events!inner(id, name, event_date, start_time, distance_km, event_type, status, start_location, chapters(name, slug))'

export interface CardReminderCandidateRow {
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

/**
 * The sweep's candidate query, exported so the real-DB suite can run the exact
 * select the cron runs: a wrong embed or a mis-spelled embedded filter passes
 * the mock suite and only shows up against real PostgREST.
 *
 * `earliestEventDate` is a coarse Toronto date prune — a pre-ride start can
 * precede the event date, so the real window check happens per row in
 * `sendCardReminders`.
 */
export function fetchCardReminderCandidates(
  supabase: SupabaseClient<Database>,
  earliestEventDate: string
) {
  return (
    supabase
      .from('registrations')
      .select(CANDIDATE_SELECT)
      .eq('status', 'registered')
      .eq('brevet_card_type', 'digital')
      .is('card_reminder_sent_at', null)
      .eq('events.status', 'scheduled')
      .in('events.event_type', [...DIGITAL_CARD_EVENT_TYPES])
      .gte('events.event_date', earliestEventDate)
      // Parent columns only: PostgREST can't order the parent rows by an
      // embedded column, so `events.event_date` is not an option here. Oldest
      // registration first gives the cap a stable, fair cut.
      .order('registered_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(CARD_REMINDER_BATCH_LIMIT)
  )
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

  // Checked before anything is claimed. `sendEventFlowEmail` reports
  // `{ sent: false }` with no error when SES is unconfigured, and the claim is
  // stamped before the send, so sweeping without SES would mark every
  // in-window rider as reminded and lose the email — unrecoverable without SQL.
  //
  // Setup failures throw rather than report: the caller (the cron route) logs
  // them to Sentry and answers 500, which turns the hourly Actions job red. A
  // run that could never have sent anything must not read as a quiet no-op.
  if (!isEmailConfigured()) {
    throw new Error('AWS SES not configured; skipping card reminder sweep')
  }

  // Coarse prune only — a pre-ride start can precede the event date, and the
  // real window check happens per registration below.
  const earliestEventDate = torontoDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const { data, error } = await fetchCardReminderCandidates(supabase, earliestEventDate)

  if (error) {
    throw new Error(`Failed to fetch card reminder candidates: ${error.message}`)
  }

  const registrations = (data || []) as unknown as CardReminderCandidateRow[]
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
    throw new Error(`Failed to fetch event controls: ${controlsError.message}`)
  }

  const eventsWithControls = new Set(
    ((controlRows || []) as { event_id: string }[]).map((row) => row.event_id)
  )

  for (const reg of registrations) {
    const event = reg.events

    // One malformed row must not starve every rider behind it: the sweep gets
    // a single chance per row before its window closes, so a throw is recorded
    // against that rider and the loop carries on.
    try {
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
        // Per-row failures keep the sweep at HTTP 200 — one bad row shouldn't
        // hide the riders that were emailed — so Sentry is the only place this
        // gets noticed.
        logError(claimError, {
          operation: 'card-reminders.claim',
          context: { registrationId: reg.id, eventId: reg.event_id },
        })
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
        // Midnight is both `computeEventStart`'s no-start-time fallback and a
        // legitimate pre-ride start, so the sender is told which it is from the
        // columns rather than left to infer it from the instant.
        startTimeKnown: event.start_time !== null || reg.pre_ride_start_time !== null,
      })

      if (sent) {
        result.sent++
        console.log(`Sent digital card reminder for ${event.name} (registration ${reg.id})`)
      } else {
        // The claim is already stamped, so this reminder is gone for good —
        // record it even when the sender reports no error, or the cron response
        // would show a run that checked riders, sent nothing, and flagged nothing.
        const message = `Failed to send card reminder to ${riderName} for ${event.name}: ${
          sendError ?? 'email not sent'
        }`
        logError(new Error(message), {
          operation: 'card-reminders.send',
          context: { registrationId: reg.id, eventId: reg.event_id },
        })
        result.errors.push(message)
      }
    } catch (err) {
      logError(err, {
        operation: 'card-reminders.row',
        context: { registrationId: reg.id, eventId: reg.event_id },
      })
      const riderName = reg.riders
        ? `${reg.riders.first_name} ${reg.riders.last_name}`
        : `registration ${reg.id}`
      result.errors.push(
        `Failed to send card reminder to ${riderName} for ${event.name}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      )
    }
  }

  return result
}
