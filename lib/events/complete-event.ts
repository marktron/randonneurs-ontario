import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendgrid, fromEmail } from '@/lib/email/sendgrid'
import { buildResultSubmissionRequestEmail } from '@/lib/email/templates'
import { format } from 'date-fns'
import type {
  RegistrationWithRider,
  ResultWithRiderId,
  ResultInsert,
  ResultWithSubmissionToken,
} from '@/types/queries'

interface EventForCompletion {
  id: string
  name: string
  event_date: string
  distance_km: number
  chapters: { name: string } | null
}

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
  event: EventForCompletion
): Promise<CompleteEventResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []
  const created: CreatedResult[] = []
  let emailsSent = 0

  // Get registrations for this event
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, rider_id, riders(id, first_name, last_name, email)')
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

  // Filter registrations that don't have results yet and have email
  const typedRegistrations = (registrations || []) as RegistrationWithRider[]
  const registrationsNeedingResults = typedRegistrations.filter(
    reg => !existingRiderIds.has(reg.rider_id) && reg.riders?.email
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
    }

    const { data: result, error: createError } = await supabase
      .from('results')
      .insert(insertData)
      .select('submission_token')
      .single()

    if (createError || !result) {
      const riderName = reg.riders ? `${reg.riders.first_name} ${reg.riders.last_name}` : 'Unknown'
      errors.push(`Failed to create result for ${riderName}: ${createError?.message || 'Unknown error'}`)
      continue
    }

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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://randonneursontario.ca'

  for (const result of created) {
    const submissionUrl = `${baseUrl}/results/submit/${result.submissionToken}`

    const emailData = {
      riderName: result.riderName,
      riderEmail: result.riderEmail,
      eventName: event.name,
      eventDate: format(new Date(event.event_date), 'MMMM d, yyyy'),
      eventDistance: event.distance_km,
      chapterName: event.chapters?.name || 'Randonneurs Ontario',
      submissionUrl,
    }

    const { subject, text, html } = buildResultSubmissionRequestEmail(emailData)

    try {
      if (process.env.SENDGRID_API_KEY) {
        await sendgrid.send({
          to: result.riderEmail,
          from: fromEmail,
          subject,
          text,
          html,
        })
        emailsSent++
        console.log(`Sent result submission email to ${result.riderEmail} for event ${event.name}`)
      } else {
        console.warn(`SendGrid not configured, skipping email to ${result.riderEmail}`)
      }
    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error'
      errors.push(`Failed to send email to ${result.riderEmail}: ${errorMessage}`)
    }
  }

  return { resultsCreated: created.length, emailsSent, errors }
}
