/**
 * Pure geometry for a route's GPS track: used to let a permanent rider pick a
 * start point on the route and to re-check that choice when controls are
 * imported. No I/O. See docs/control-cards.md, "Direction and alternate start".
 */
import { haversineMeters } from '@/lib/geo'

export interface TrackPoint {
  lat: number
  lng: number
  /** Cumulative distance from the posted start, in km. */
  km: number
}

export interface RouteTrack {
  points: TrackPoint[]
  /** Route length rounded to 0.1 km: the canonical `T` everywhere. */
  totalKm: number
  /** First and last points within LOOP_CLOSURE_M of each other. */
  isLoop: boolean
}

/** A start point in canonical form: offset rounded to 0.1 km, coordinates from the track. */
export interface StartPoint {
  offsetKm: number
  lat: number
  lng: number
}

const LOOP_CLOSURE_M = 500
const OVERLAP_RADIUS_M = 150
const MIN_PASS_SEPARATION_KM = 1
const MIN_SPACING_KM = 0.1
const MAX_TRACK_POINTS = 3000

const tenths = (km: number) => Math.round(km * 10)

export function roundKm(km: number): number {
  return tenths(km) / 10
}

/** Spacing between kept points: 100 m, widened on very long routes to cap the payload. */
function spacingKm(totalKm: number): number {
  return Math.max(MIN_SPACING_KM, totalKm / MAX_TRACK_POINTS)
}

/** Distance within which two points count as the same place on this track. */
function sameSpotRadiusM(track: RouteTrack): number {
  return Math.max(OVERLAP_RADIUS_M, spacingKm(track.totalKm) * 1000)
}

export function buildRouteTrack(raw: TrackPoint[], distanceKm: number): RouteTrack | null {
  const usable = raw.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.km)
  )
  if (usable.length < 2) return null

  const first = usable[0]
  const last = usable[usable.length - 1]
  const totalKm = roundKm(distanceKm > 0 ? distanceKm : last.km)
  if (totalKm <= 0) return null

  const spacing = spacingKm(totalKm)
  const points: TrackPoint[] = [first]
  for (let i = 1; i < usable.length - 1; i++) {
    if (usable[i].km - points[points.length - 1].km >= spacing) points.push(usable[i])
  }
  points.push(last)

  return {
    points,
    totalKm,
    isLoop: haversineMeters(first.lat, first.lng, last.lat, last.lng) <= LOOP_CLOSURE_M,
  }
}

/** The track point whose distance is closest to `km`. */
export function pointAtKm(track: RouteTrack, km: number): TrackPoint {
  let best = track.points[0]
  let bestDelta = Infinity
  for (const p of track.points) {
    const delta = Math.abs(p.km - km)
    if (delta < bestDelta) {
      bestDelta = delta
      best = p
    }
  }
  return best
}

/**
 * Canonical start for a distance along the route, or null when it is not a
 * usable alternate start: not a number, off the route, or within 0.1 km of the
 * posted start/finish (which means "start where the route starts").
 */
export function canonicalStart(track: RouteTrack, km: number): StartPoint | null {
  if (!Number.isFinite(km)) return null
  const t = tenths(km)
  const total = tenths(track.totalKm)
  if (t < 1 || t > total - 1) return null
  const offsetKm = t / 10
  const p = pointAtKm(track, offsetKm)
  return { offsetKm, lat: p.lat, lng: p.lng }
}

/**
 * Candidate starts for a tap on the map. The tap snaps to the nearest track
 * point however far away it is (a zoomed-out map makes any fixed radius a few
 * pixels). Where the route passes that same spot more than once, every pass
 * is returned, ordered by distance, so the rider can say which one they mean.
 * Empty when the only match is the posted start/finish.
 */
export function snapToTrack(track: RouteTrack, lat: number, lng: number): StartPoint[] {
  let anchor: TrackPoint | null = null
  let best = Infinity
  for (const p of track.points) {
    const d = haversineMeters(lat, lng, p.lat, p.lng)
    if (d < best) {
      best = d
      anchor = p
    }
  }
  if (!anchor) return []

  const radius = sameSpotRadiusM(track)
  const passes: TrackPoint[] = [anchor]
  let run: { p: TrackPoint; d: number }[] = []
  const flush = () => {
    if (run.length === 0) return
    const closest = run.reduce((a, b) => (b.d < a.d ? b : a)).p
    if (passes.every((q) => Math.abs(q.km - closest.km) > MIN_PASS_SEPARATION_KM)) {
      passes.push(closest)
    }
    run = []
  }
  for (const p of track.points) {
    const d = haversineMeters(anchor.lat, anchor.lng, p.lat, p.lng)
    if (d <= radius) run.push({ p, d })
    else flush()
  }
  flush()

  const seen = new Set<number>()
  return passes
    .map((p) => canonicalStart(track, p.km))
    .filter((s): s is StartPoint => s !== null)
    .filter((s) => (seen.has(s.offsetKm) ? false : (seen.add(s.offsetKm), true)))
    .sort((a, b) => a.offsetKm - b.offsetKm)
}

/**
 * Re-check a stored start against the current track: the RWGPS route may
 * have been edited since the rider chose it.
 */
export function checkStoredStart(
  track: RouteTrack,
  start: StartPoint
): 'ok' | 'off_track' | 'beyond_route' {
  if (tenths(start.offsetKm) > tenths(track.totalKm) - 1) return 'beyond_route'
  const p = pointAtKm(track, start.offsetKm)
  return haversineMeters(p.lat, p.lng, start.lat, start.lng) <= sameSpotRadiusM(track)
    ? 'ok'
    : 'off_track'
}

/** A control from the route's RWGPS data, with the distance it is passed at. */
export interface RouteControl {
  name: string
  /** Distance along the posted route, in km. */
  km: number
  lat: number
  lng: number
}

/** One physical control place offered as a start, with every pass of it. */
export interface ControlPlace {
  name: string
  lat: number
  lng: number
  /** Canonical starts, in route order. */
  passes: StartPoint[]
}

/**
 * Controls a rider can start at, one entry per physical place, in route
 * order. Controls at the posted start or finish are left out (they are the
 * posted start). Controls that share a name and sit within 150 m of each
 * other are one place passed more than once.
 */
export function offeredControlPlaces(track: RouteTrack, controls: RouteControl[]): ControlPlace[] {
  const places: ControlPlace[] = []
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  for (const control of [...controls].sort((a, b) => a.km - b.km)) {
    const start = canonicalStart(track, control.km)
    if (!start) continue
    const place = places.find(
      (p) =>
        sameName(p.name, control.name) &&
        haversineMeters(p.lat, p.lng, control.lat, control.lng) <= OVERLAP_RADIUS_M
    )
    if (!place) {
      places.push({ name: control.name, lat: control.lat, lng: control.lng, passes: [start] })
    } else if (!place.passes.some((s) => s.offsetKm === start.offsetKm)) {
      place.passes.push(start)
    }
  }
  return places
}

/**
 * Name of the route's own start control, for labelling the posted start: the
 * control within 0.1 km of km 0, else the one within 0.1 km of the end (on a
 * loop the finish control is the same place), else null.
 */
export function postedStartControlName(track: RouteTrack, controls: RouteControl[]): string | null {
  const total = tenths(track.totalKm)
  const sorted = [...controls].sort((a, b) => a.km - b.km)
  const atStart = sorted.find((c) => tenths(c.km) < 1)
  const atEnd = [...sorted].reverse().find((c) => tenths(c.km) > total - 1)
  return (atStart ?? atEnd)?.name ?? null
}
