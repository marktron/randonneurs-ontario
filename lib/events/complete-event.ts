import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendgrid, fromEmail } from '@/lib/email/sendgrid'
import { buildResultSubmissionRequestEmail } from '@/lib/email/templates'
import { format } from 'date-fns'

interface EventForCompletion {
  id: string
  name: string
  event_date: string
  distance_km: number
  chapters: { name: string } | null
}

interface Registration {
  id: string
  rider_id: string
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registrations, error: regError } = await (supabase.from('registrations') as any)
    .select('id, rider_id, riders(id, first_name, last_name, email)')
    .eq('event_id', event.id)
    .eq('status', 'registered')

  if (regError) {
    errors.push(`Failed to fetch registrations: ${regError.message}`)
    return { resultsCreated: 0, emailsSent: 0, errors }
  }

  // Get existing results to avoid duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingResults, error: resError } = await (supabase.from('results') as any)
    .select('rider_id')
    .eq('event_id', event.id)

  if (resError) {
    errors.push(`Failed to fetch existing results: ${resError.message}`)
    return { resultsCreated: 0, emailsSent: 0, errors }
  }

  const existingRiderIds = new Set((existingResults || []).map((r: { rider_id: string }) => r.rider_id))

  // Filter registrations that don't have results yet and have email
  const registrationsNeedingResults = ((registrations || []) as Registration[]).filter(
    reg => !existingRiderIds.has(reg.rider_id) && reg.riders?.email
  )

  // Calculate season from event date
  const eventYear = parseInt(event.event_date.split('-')[0])

  // Create pending results for each registration
  for (const reg of registrationsNeedingResults) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: createError } = await (supabase.from('results') as any)
      .insert({
        event_id: event.id,
        rider_id: reg.rider_id,
        status: 'pending',
        season: eventYear,
        distance_km: event.distance_km,
      })
      .select('submission_token')
      .single()

    if (createError) {
      errors.push(`Failed to create result for ${reg.riders.first_name} ${reg.riders.last_name}: ${createError.message}`)
      continue
    }

    created.push({
      riderId: reg.rider_id,
      riderName: `${reg.riders.first_name} ${reg.riders.last_name}`,
      riderEmail: reg.riders.email!,
      submissionToken: result.submission_token,
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
