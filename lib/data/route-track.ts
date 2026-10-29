/**
 * Cached GPS track and controls for a route, used by the permanent start
 * picker and by registration to validate a chosen start.
 */
import { unstable_cache } from 'next/cache'
import { fetchRwgpsRouteMap } from '@/lib/rwgps'
import { buildRouteTrack, type RouteControl, type RouteTrack } from '@/lib/routeTrack'
import { handleDataError } from '@/lib/errors'

const TRACK_REVALIDATE_SECONDS = 24 * 60 * 60

export interface RouteMap {
  track: RouteTrack
  /** Empty when the route has no controls with coordinates. */
  controls: RouteControl[]
}

/**
 * Null when the track cannot be loaded. Failures throw inside the cached
 * function so they are never cached: the next call retries RWGPS.
 */
export async function loadRouteMap(rwgpsId: string): Promise<RouteMap | null> {
  try {
    return await unstable_cache(
      async (): Promise<RouteMap> => {
        const { points, totalKm, controls } = await fetchRwgpsRouteMap(rwgpsId)
        const track = buildRouteTrack(points, totalKm)
        if (!track) throw new Error(`RWGPS route ${rwgpsId} has no usable track`)
        return { track, controls }
      },
      // A new key whenever the cached shape or the control-name cleaning
      // changes, so stale entries are never served: 'route-track' held the
      // track alone, 'route-map' kept names like "CTL: Paris" uncleaned.
      ['route-map-v2', rwgpsId],
      { revalidate: TRACK_REVALIDATE_SECONDS, tags: ['routes'] }
    )()
  } catch (error) {
    return handleDataError(error, { operation: 'loadRouteMap' }, null)
  }
}

/** The track alone, for callers that do not need the controls. */
export async function loadRouteTrack(rwgpsId: string): Promise<RouteTrack | null> {
  return (await loadRouteMap(rwgpsId))?.track ?? null
}
