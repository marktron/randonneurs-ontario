import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendResultSubmissionEmail } from '@/lib/email/send-result-submission-email'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'
import type {
  RegistrationWithRider,
  ResultWithRiderId,
  ResultInsert,
  ResultWithSubmissionToken,
} from '@/types/queries'

interface CreatedResult {
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
  const created: CreatedResult[] = []
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

  // Get existing results to avoid duplicates
  const { data: existingResults, error: resError } = await supabase
    .from('results')
    .select('rider_id')
    .eq('event_id', event.id)

  if (resError) {
    errors.push(`Failed to fetch existing results: ${resError.message}`)
    return { resultsCreated: 0, emailsSent: 0, errors }
  }

  const typedExistingResults = (existingResults || []) as ResultWithRiderId[]
  const existingRiderIds = new Set(typedExistingResults.map((r) => r.rider_id))

  // Filter registrations that don't already have a result. Riders without an
  // email still get a pending result (admin can share the submission URL
  // manually); only email sending is gated on having an address.
  const typedRegistrations = (registrations || []) as (RegistrationWithRider & {
    management_token: string | null
  })[]
  const registrationsNeedingResults = typedRegistrations.filter(
    (reg) => !existingRiderIds.has(reg.rider_id)
  )

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

    created.push({
      riderId: reg.rider_id,
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email,
      submissionToken: typedResult.submission_token || '',
    })
  }

  // Send emails to riders with their submission links
  for (const result of created) {
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
