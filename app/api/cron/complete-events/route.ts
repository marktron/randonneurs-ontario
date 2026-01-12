import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { closeHours } from '@/lib/brmTimes'
import { createPendingResultsAndSendEmails } from '@/lib/events/complete-event'

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
        const { resultsCreated, emailsSent, errors: resultErrors } = await createPendingResultsAndSendEmails(event)

        completedEvents.push({
          id: event.id,
          name: event.name,
          resultsCreated,
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
