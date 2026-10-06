import { NextResponse } from 'next/server'
import { announceNewAwards } from '@/lib/awards/announce-awards'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { logError } from '@/lib/errors'

/**
 * Cron endpoint that posts newly assigned awards to Slack (see
 * lib/awards/announce-awards.ts for the outbox sweep and retry rules).
 *
 * This endpoint is called by GitHub Actions (see .github/workflows/announce-awards.yml).
 * It requires the CRON_SECRET environment variable for authentication. When
 * SLACK_AWARDS_WEBHOOK_URL is unset the sweep is a no-op that reports
 * `configured: false`.
 */

/** A run is two queries, a Slack post or two, and a few updates. */
export const maxDuration = 60

export async function GET(request: Request) {
  const authError = authorizeCronRequest(request, 'announce-awards')
  if (authError) {
    return authError
  }

  try {
    const result = await announceNewAwards()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logError(error, { operation: 'announce-awards' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
