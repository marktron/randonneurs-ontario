import { NextResponse, type NextRequest } from 'next/server'
import { LEGACY_EVENT_MAP } from '@/lib/legacy-redirects'

/**
 * Redirect old-site schedule URLs to new registration pages.
 *
 * Old format: /schedule/1353
 * New format: /register/concord-bradford-90km-2026-04-04
 *
 * Safe to delete after the 2026 season ends.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schedId: string }> }
) {
  const { schedId } = await params

  if (schedId && LEGACY_EVENT_MAP[schedId]) {
    return NextResponse.redirect(
      new URL(`/register/${LEGACY_EVENT_MAP[schedId]}`, request.url),
      301
    )
  }

  // Unknown ID — send to the schedule page
  return NextResponse.redirect(new URL('/calendar', request.url), 302)
}
