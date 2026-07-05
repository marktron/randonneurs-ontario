import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendResultSubmissionEmail } from '@/lib/email/send-result-submission-email'
import { sendRideCompleteEmail } from '@/lib/email/send-ride-complete-email'
import { formatFinishTime } from '@/lib/utils'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'

interface RegistrationRow {
  id: string
  rider_id: string
  riders: { id: string; first_name: string; last_name: string; email: string | null } | null
}

interface ReminderResultRow {
  rider_id: string
  submission_token: string | null
  status: string | null
  finish_time: string | null
  gpx_url: string | null
  gpx_file_path: string | null
  submitted_at: string | null
}

export interface SendRemindersResult {
  emailsSent: number
  errors: string[]
}

/**
 * Sends result reminder emails to registered riders for a completed event:
 * - riders whose result is still pending get the standard submission
 *   reminder (unchanged);
 * - riders whose result is finished (digital-card pre-fill) but has neither
 *   a Strava link nor a GPX file — and who have at least one card check-in —
 *   get the "add your ride track" reminder. Paper-card riders without
 *   check-ins are never nagged for a track.
 * Re-uses the submission token created when the event was completed; riders
 * without an email or token are skipped.
 */
export async function sendResultSubmissionReminders(
  event: EventForSubmissionEmail
): Promise<SendRemindersResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []
  let emailsSent = 0

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, rider_id, riders(id, first_name, last_name, email)')
    .eq('event_id', event.id)
    .eq('status', 'registered')

  if (regError) {
    errors.push(`Failed to fetch registrations: ${regError.message}`)
    return { emailsSent: 0, errors }
  }

  const typedRegistrations = (registrations || []) as RegistrationRow[]

  const { data: resultRows, error: resError } = await supabase
    .from('results')
    .select('rider_id, submission_token, status, finish_time, gpx_url, gpx_file_path, submitted_at')
    .eq('event_id', event.id)

  if (resError) {
    errors.push(`Failed to fetch results: ${resError.message}`)
    return { emailsSent: 0, errors }
  }

  const resultsByRiderId = new Map(
    ((resultRows || []) as ReminderResultRow[]).map((r) => [r.rider_id, r])
  )

  const registrationIds = typedRegistrations.map((r) => r.id)
  const { data: checkinRows, error: checkinError } = await supabase
    .from('control_checkins')
    .select('registration_id')
    .in('registration_id', registrationIds)

  if (checkinError) {
    errors.push(`Failed to fetch check-ins: ${checkinError.message}`)
  }

  const registrationsWithCheckins = new Set(
    checkinError
      ? []
      : ((checkinRows || []) as { registration_id: string }[]).map((c) => c.registration_id)
  )

  for (const reg of typedRegistrations) {
    const rider = reg.riders
    const result = resultsByRiderId.get(reg.rider_id)

    if (!rider || !rider.email || !result || !result.submission_token) {
      continue
    }

    if (result.submitted_at) {
      continue
    }

    if (result.status === 'pending') {
      const { sent, error } = await sendResultSubmissionEmail({
        event,
        riderName: `${rider.first_name} ${rider.last_name}`,
        riderEmail: rider.email,
        submissionToken: result.submission_token,
        reminder: true,
      })
      if (sent) emailsSent++
      if (error) errors.push(`Failed to send result reminder email: ${error}`)
      continue
    }

    const missingTrack = !result.gpx_url && !result.gpx_file_path
    if (result.status === 'finished' && missingTrack && registrationsWithCheckins.has(reg.id)) {
      const { sent, error } = await sendRideCompleteEmail({
        event,
        riderName: `${rider.first_name} ${rider.last_name}`,
        riderEmail: rider.email,
        submissionToken: result.submission_token,
        finishTime: formatFinishTime(result.finish_time),
        reminder: true,
      })
      if (sent) emailsSent++
      if (error) errors.push(`Failed to send track reminder email: ${error}`)
    }
  }

  return { emailsSent, errors }
}
