import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { closeHours } from '@/lib/brmTimes'
import { sendgrid, fromEmail } from '@/lib/email/sendgrid'
import { buildResultSubmissionRequestEmail } from '@/lib/email/templates'
import { format } from 'date-fns'

/**
 * Cron endpoint to automatically mark events as 'completed' once their
 * closing time has passed, and send result submission emails to riders.
 *
 * Closing time is calculated as: event_date + start_time + closeHours(distance)
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json).
 * It requires the CRON_SECRET environment variable for authentication.
 */

const DEFAULT_START_TIME = '08:00' // 8am default if no start time specified

interface ScheduledEvent {
  id: string
  name: string
  event_date: string // YYYY-MM-DD
  start_time: string | null // HH:MM
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

function calculateClosingTime(event: ScheduledEvent): Date {
  const { event_date, start_time, distance_km } = event

  // Parse event date and start time
  const [year, month, day] = event_date.split('-').map(Number)
  const [hours, minutes] = (start_time || DEFAULT_START_TIME).split(':').map(Number)

  // Create start datetime
  const startDate = new Date(year, month - 1, day, hours, minutes)

  // Calculate closing time by adding closeHours to start time
  const closingMinutes = closeHours(distance_km) * 60
  const closingDate = new Date(startDate.getTime() + closingMinutes * 60 * 1000)

  return closingDate
}

async function createPendingResultsAndSendEmails(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  event: ScheduledEvent
): Promise<{ created: CreatedResult[]; emailsSent: number; errors: string[] }> {
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
    return { created, emailsSent, errors }
  }

  // Get existing results to avoid duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingResults, error: resError } = await (supabase.from('results') as any)
    .select('rider_id')
    .eq('event_id', event.id)

  if (resError) {
    errors.push(`Failed to fetch existing results: ${resError.message}`)
    return { created, emailsSent, errors }
  }

  const existingRiderIds = new Set((existingResults || []).map((r: { rider_id: string }) => r.rider_id))

  // Filter registrations that don't have results yet
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

  return { created, emailsSent, errors }
}

export async function GET(request: Request) {
  // Verify cron secret for authentication
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable not configured')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const now = new Date()

    // Fetch all scheduled events (exclude cancelled and already completed/submitted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events, error: fetchError } = await (supabase.from('events') as any)
      .select('id, name, event_date, start_time, distance_km, chapters(name)')
      .eq('status', 'scheduled')

    if (fetchError) {
      console.error('Error fetching scheduled events:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      )
    }

    const scheduledEvents = (events || []) as ScheduledEvent[]
    const completedEvents: { id: string; name: string; resultsCreated: number; emailsSent: number }[] = []
    const errors: { id: string; name: string; error: string }[] = []

    // Check each event and mark as completed if closing time has passed
    for (const event of scheduledEvents) {
      const closingTime = calculateClosingTime(event)

      if (now > closingTime) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from('events') as any)
          .update({ status: 'completed' })
          .eq('id', event.id)

        if (updateError) {
          console.error(`Error updating event ${event.id}:`, updateError)
          errors.push({ id: event.id, name: event.name, error: updateError.message })
          continue
        }

        console.log(`Auto-completed event: ${event.name} (${event.id})`)

        // Create pending results and send emails
        const { created, emailsSent, errors: resultErrors } = await createPendingResultsAndSendEmails(
          supabase,
          event
        )

        completedEvents.push({
          id: event.id,
          name: event.name,
          resultsCreated: created.length,
          emailsSent,
        })

        // Add any result creation errors
        for (const err of resultErrors) {
          errors.push({ id: event.id, name: event.name, error: err })
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked: scheduledEvents.length,
      completed: completedEvents.length,
      completedEvents,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error in complete-events cron:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
