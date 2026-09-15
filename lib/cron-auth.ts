import { NextResponse } from 'next/server'
import { logError } from '@/lib/errors'

/**
 * Shared bearer-token gate for GitHub Actions cron endpoints. Returns a
 * NextResponse to send immediately (500 when CRON_SECRET is unset, 401 on
 * mismatch) or null when the request is authorized.
 */
export function authorizeCronRequest(request: Request, operation: string): NextResponse | null {
  // Verify cron secret for authentication
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logError(new Error('CRON_SECRET environment variable not configured'), {
      operation: `${operation}.auth`,
    })
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
