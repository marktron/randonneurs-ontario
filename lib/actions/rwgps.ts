'use server'

/**
 * Server actions wrapping the RideWithGPS route fetchers for client
 * components. The public control-card form used to fetch RWGPS directly from
 * the browser, but control import now needs the authenticated v1 API (only it
 * reports each POI's `distances`), and those credentials must stay on the
 * server. See docs/control-cards.md § RWGPS import.
 *
 * Both actions return an ActionResult rather than throwing: Next.js masks
 * thrown server-action messages in production, and the form shows the RWGPS
 * message ("No control points found in the RWGPS route…") inline.
 */

import { fetchRwgpsControls, fetchRwgpsRoute, type ParsedControl } from '@/lib/rwgps'
import { handleActionError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export interface LoadedRwgpsRoute {
  name: string
  distanceKm: number
  controls: ParsedControl[]
}

/**
 * Fetch a route's name, distance, and controls by RWGPS id (with an optional
 * share-link privacy code) for the control-card form's "paste a RWGPS link"
 * mode.
 */
export async function loadRwgpsRoute(
  rwgpsId: string,
  privacyCode?: string | null
): Promise<ActionResult<LoadedRwgpsRoute>> {
  try {
    return createActionResult(await fetchRwgpsRoute(rwgpsId, privacyCode))
  } catch (error) {
    // fetchRwgpsRoute throws user-facing messages by design; surface them.
    if (error instanceof Error && error.message) {
      return { success: false, error: error.message }
    }
    return handleActionError(
      error,
      { operation: 'loadRwgpsRoute' },
      'Failed to fetch route data from RideWithGPS'
    )
  }
}

/** Fetch just the controls for a route already picked from the database. */
export async function loadRwgpsControls(rwgpsId: string): Promise<ActionResult<ParsedControl[]>> {
  try {
    return createActionResult(await fetchRwgpsControls(rwgpsId))
  } catch (error) {
    if (error instanceof Error && error.message) {
      return { success: false, error: error.message }
    }
    return handleActionError(
      error,
      { operation: 'loadRwgpsControls' },
      'Failed to fetch route data from RideWithGPS'
    )
  }
}
