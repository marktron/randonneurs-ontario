import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendResultSubmissionEmail } from '@/lib/email/send-result-submission-email'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'

interface RegistrationRow {
  rider_id: string
  riders: { id: string; first_name: string; last_name: string; email: string | null } | null
}

interface PendingResultRow {
  rider_id: string
  submission_token: string | null
}

export interface SendRemindersResult {
  emailsSent: number
  errors: string[]
}

/**
 * Sends result submission reminder emails to registered riders whose result
 * for the event is still pending. Re-uses the submission token created when
 * the event was completed (see complete-event.ts); riders without an email,
 * a pending result, or a token are skipped.
 */
export async function sendResultSubmissionReminders(
  event: EventForSubmissionEmail
): Promise<SendRemindersResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []
  let emailsSent = 0

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('rider_id, riders(id, first_name, last_name, email)')
    .eq('event_id', event.id)
    .eq('status', 'registered')

  if (regError) {
    errors.push(`Failed to fetch registrations: ${regError.message}`)
    return { emailsSent: 0, errors }
  }

  const { data: pendingResults, error: resError } = await supabase
    .from('results')
    .select('rider_id, submission_token')
    .eq('event_id', event.id)
    .eq('status', 'pending')

  if (resError) {
    errors.push(`Failed to fetch pending results: ${resError.message}`)
    return { emailsSent: 0, errors }
  }

  const tokensByRiderId = new Map(
    ((pendingResults || []) as PendingResultRow[]).map((r) => [r.rider_id, r.submission_token])
  )

  for (const reg of (registrations || []) as RegistrationRow[]) {
    const rider = reg.riders
    const submissionToken = tokensByRiderId.get(reg.rider_id)

    if (!rider || !rider.email || !submissionToken) {
      continue
    }

    const { sent, error } = await sendResultSubmissionEmail({
      event,
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email,
      submissionToken,
      reminder: true,
    })

    if (sent) {
      emailsSent++
    }
    if (error) {
      errors.push(`Failed to send result reminder email: ${error}`)
    }
  }

  return { emailsSent, errors }
}
