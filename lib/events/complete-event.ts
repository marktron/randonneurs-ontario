import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendResultSubmissionEmail } from '@/lib/email/send-result-submission-email'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'
import type {
  RegistrationWithRider,
  ResultForCompletionCheck,
  ResultInsert,
  ResultUpdate,
  ResultWithSubmissionToken,
} from '@/types/queries'

interface ResultToEmail {
  riderId: string
  riderName: string
  riderEmail: string
  submissionToken: string
}

export interface CompleteEventResult {
  resultsCreated: number
  emailsSent: number
  errors: string[]
}

/**
 * Creates pending results for all registered riders and sends them
 * emails with links to submit their own results.
 *
 * This is called both by:
 * - The cron job when auto-completing events
 * - The admin action when manually setting status to "completed"
 */
export async function createPendingResultsAndSendEmails(
  event: EventForSubmissionEmail
): Promise<CompleteEventResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []
  const toEmail: ResultToEmail[] = []
  let resultsCreated = 0
  let emailsSent = 0

  // Get registrations for this event
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, rider_id, management_token, riders(id, first_name, last_name, email)')
    .eq('event_id', event.id)
    .eq('status', 'registered')

  if (regError) {
    errors.push(`Failed to fetch registrations: ${regError.message}`)
    return { resultsCreated: 0, emailsSent: 0, errors }
  }

  // Get existing results to avoid duplicates. Also pull status/submitted_at/
  // submission_token so we can still email riders who already hold a row
  // (e.g. a card pre-fill reverted by an undo) that's still an un-submitted
  // pending placeholder — createPendingResults never touches those rows, so
  // without this they'd miss the event-close email entirely.
  const { data: existingResults, error: resError } = await supabase
    .from('results')
    .select('rider_id, status, submitted_at, submission_token')
    .eq('event_id', event.id)

  if (resError) {
    errors.push(`Failed to fetch existing results: ${resError.message}`)
    return { resultsCreated: 0, emailsSent: 0, errors }
  }

  const typedExistingResults = (existingResults || []) as ResultForCompletionCheck[]
  const existingByRiderId = new Map(typedExistingResults.map((r) => [r.rider_id, r]))

  // Filter registrations that don't already have a result. Riders without an
  // email still get a pending result (admin can share the submission URL
  // manually); only email sending is gated on having an address.
  const typedRegistrations = (registrations || []) as (RegistrationWithRider & {
    management_token: string | null
  })[]
  const registrationsNeedingResults = typedRegistrations.filter(
    (reg) => !existingByRiderId.has(reg.rider_id)
  )

  // Registrations that already have a row, but one still awaiting the
  // rider's own submission (status pending, submitted_at NULL). All other
  // existing rows (finished/dnf/otd/submitted) are left alone.
  const registrationsWithPendingResults = typedRegistrations.filter((reg) => {
    const existing = existingByRiderId.get(reg.rider_id)
    return !!existing && existing.status === 'pending' && !existing.submitted_at
  })

  // Calculate season from event date
  const eventYear = parseInt(event.event_date.split('-')[0])

  // Create pending results for each registration
  for (const reg of registrationsNeedingResults) {
    const insertData: ResultInsert = {
      event_id: event.id,
      rider_id: reg.rider_id,
      status: 'pending',
      season: eventYear,
      distance_km: event.distance_km,
      ...(reg.management_token ? { submission_token: reg.management_token } : {}),
    }

    const { data: result, error: createError } = await supabase
      .from('results')
      .insert(insertData)
      .select('submission_token')
      .single()

    if (createError || !result) {
      const riderName = reg.riders ? `${reg.riders.first_name} ${reg.riders.last_name}` : 'Unknown'
      errors.push(
        `Failed to create result for ${riderName}: ${createError?.message || 'Unknown error'}`
      )
      continue
    }

    resultsCreated++

    const typedResult = result as ResultWithSubmissionToken
    const rider = reg.riders

    if (!rider || !rider.email) {
      continue
    }

    toEmail.push({
      riderId: reg.rider_id,
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email,
      submissionToken: typedResult.submission_token || '',
    })
  }

  // Also email registered riders whose row already exists but is still an
  // un-submitted pending placeholder (e.g. a rider undid a mistaken final
  // check-in on the digital card). Use the row's own token; backfill it only
  // if NULL, the same way a brand-new row would get one.
  for (const reg of registrationsWithPendingResults) {
    const rider = reg.riders
    if (!rider || !rider.email) continue

    const existing = existingByRiderId.get(reg.rider_id)!
    let submissionToken = existing.submission_token

    if (!submissionToken) {
      const backfillToken = reg.management_token || crypto.randomUUID()
      const { data: backfilled, error: backfillError } = await supabase
        .from('results')
        .update({ submission_token: backfillToken } as ResultUpdate)
        .eq('event_id', event.id)
        .eq('rider_id', reg.rider_id)
        .is('submission_token', null)
        .eq('status', 'pending')
        .is('submitted_at', null)
        .select('submission_token')
        .maybeSingle()

      if (backfillError) {
        errors.push(
          `Failed to backfill submission token for ${rider.first_name} ${rider.last_name}: ${backfillError.message}`
        )
        continue
      }
      // Zero rows matched (a race already gave the row a token, or moved it
      // out of pending) — nothing left to backfill or email against.
      if (!backfilled) continue

      submissionToken = (backfilled as ResultWithSubmissionToken).submission_token
    }

    toEmail.push({
      riderId: reg.rider_id,
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email,
      submissionToken: submissionToken || '',
    })
  }

  // Send emails to riders with their submission links. Both the new-row and
  // existing-pending-row candidates flow through here, so a single atomic
  // claim covers both: re-running this function (cron retry, admin
  // re-completing an event) must never double-email a rider. Stamp
  // submission_email_sent_at only if it's still NULL; zero rows back means
  // another run already claimed (or won) the send — skip without emailing.
  for (const result of toEmail) {
    const { data: claimed, error: claimError } = await supabase
      .from('results')
      .update({ submission_email_sent_at: new Date().toISOString() } as ResultUpdate)
      .eq('event_id', event.id)
      .eq('rider_id', result.riderId)
      .is('submission_email_sent_at', null)
      .select('id')
      .maybeSingle()

    if (claimError) {
      errors.push(
        `Failed to claim submission email send for ${result.riderName}: ${claimError.message}`
      )
      continue
    }
    if (!claimed) continue

    const { sent, error } = await sendResultSubmissionEmail({
      event,
      riderName: result.riderName,
      riderEmail: result.riderEmail,
      submissionToken: result.submissionToken,
    })

    if (sent) {
      emailsSent++
      console.log(`Sent result submission email for event ${event.name}`)
    }
    if (error) {
      errors.push(`Failed to send result submission email: ${error}`)
    }
  }

  return { resultsCreated, emailsSent, errors }
}
