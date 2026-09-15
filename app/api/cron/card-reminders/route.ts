import { NextResponse } from 'next/server'
import { sendCardReminders } from '@/lib/events/send-card-reminders'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { logError } from '@/lib/errors'

/**
 * Cron endpoint to send digital brevet card reminder emails to riders whose
 * start is within the next 12 hours (see lib/events/send-card-reminders.ts
 * for the full sweep logic and windowing rules).
 *
 * This endpoint is called by GitHub Actions (see .github/workflows/card-reminders.yml).
 * It requires the CRON_SECRET environment variable for authentication.
 */

/**
 * The sweep sends one email per in-window rider, so a busy hour costs real
 * time. Bound it: an overrun fails loudly (and logs) rather than hanging on
 * the platform default, and the batch cap in the sweep keeps one run's work
 * inside this budget.
 */
export const maxDuration = 60

export async function GET(request: Request) {
  // Verify cron secret for authentication
  const authError = authorizeCronRequest(request, 'card-reminders')
  if (authError) {
    return authError
  }

  try {
    const result = await sendCardReminders()

    return NextResponse.json({
      success: true,
      ...result,
      errors: result.errors.length ? result.errors : undefined,
    })
  } catch (error) {
    logError(error, { operation: 'card-reminders' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
