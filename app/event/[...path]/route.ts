import { NextResponse, type NextRequest } from 'next/server'
import { LEGACY_EVENT_MAP, extractSchedId } from '@/lib/legacy-redirects'

/**
 * Redirect old-site event URLs to new registration pages.
 *
 * Old format: /event/2026/huron/wizard-of-oz-1256/
 * New format: /register/wizard-of-oz-200km-2026-03-28
 *
 * Safe to delete after the 2026 season ends.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const lastSegment = path[path.length - 1]

  if (lastSegment) {
    const schedId = extractSchedId(lastSegment)
    if (schedId && LEGACY_EVENT_MAP[schedId]) {
      return NextResponse.redirect(
        new URL(`/register/${LEGACY_EVENT_MAP[schedId]}`, request.url),
        301
      )
    }
  }

  // Unknown or missing ID — send to the schedule page
  return NextResponse.redirect(new URL('/calendar', request.url), 302)
}
