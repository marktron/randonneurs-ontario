/**
 * Cached GPS track for a route, used by the permanent start picker and by
 * registration to validate a chosen start.
 */
import { unstable_cache } from 'next/cache'
import { fetchRwgpsTrack } from '@/lib/rwgps'
import { buildRouteTrack, type RouteTrack } from '@/lib/routeTrack'
import { handleDataError } from '@/lib/errors'

const TRACK_REVALIDATE_SECONDS = 24 * 60 * 60

/**
 * Null when the track cannot be loaded. Failures throw inside the cached
 * function so they are never cached: the next call retries RWGPS.
 */
export async function loadRouteTrack(rwgpsId: string): Promise<RouteTrack | null> {
  try {
    return await unstable_cache(
      async () => {
        const { points, totalKm } = await fetchRwgpsTrack(rwgpsId)
        const track = buildRouteTrack(points, totalKm)
        if (!track) throw new Error(`RWGPS route ${rwgpsId} has no usable track`)
        return track
      },
      ['route-track', rwgpsId],
      { revalidate: TRACK_REVALIDATE_SECONDS, tags: ['routes'] }
    )()
  } catch (error) {
    return handleDataError(error, { operation: 'loadRouteTrack' }, null)
  }
}
