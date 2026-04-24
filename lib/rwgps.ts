import { haversineMeters } from '@/lib/geo'

export interface ParsedControl {
  name: string
  distance: string // km, formatted to one decimal
}

type Source = 'course' | 'poi-control' | 'poi-terminus'

// Lower number = higher precedence during dedupe. POIs win over course
// points because organizer-curated POI names tend to be more descriptive
// (e.g. "CONTROL - The Broken Rail, St. Mary's") than the short course
// instruction text on course points. Within POIs, the explicit `control`
// type beats bare `start`/`finish` labels.
const SOURCE_PRIORITY: Record<Source, number> = {
  'poi-control': 0,
  'poi-terminus': 1,
  course: 2,
}

interface InternalControl {
  name: string
  distanceKm: number
  source: Source
}

// POI types that should be imported as controls. `start` and `finish` are
// treated as controls because the start/finish are always controls in BRM
// routes; some organizers mark only those endpoints via POIs.
const CONTROL_POI_TYPES: Record<string, Source> = {
  control: 'poi-control',
  start: 'poi-terminus',
  finish: 'poi-terminus',
}

interface RwgpsCoursePoint {
  n?: string
  d?: number
  t?: string
}

interface RwgpsPoi {
  name?: string
  lat?: number
  lng?: number
  poi_type_name?: string
}

interface RwgpsTrackPoint {
  x?: number // lng
  y?: number // lat
  d?: number // meters from route start
}

interface RwgpsRoute {
  course_points?: RwgpsCoursePoint[]
  points_of_interest?: RwgpsPoi[]
  track_points?: RwgpsTrackPoint[]
}

const CONTROL_NAME_PREFIXES = [
  'CTL - ',
  'CTL-',
  'CTL ',
  'CTRL - ',
  'CTRL-',
  'CTRL ',
  'CONTROL - ',
  'CONTROL-',
  'CONTROL ',
]

/**
 * Strip common control-name prefixes ("CTL -", "CTRL ", "CONTROL-", etc.)
 * used by organizers when tagging RWGPS waypoints and course points.
 */
export function cleanControlName(raw: string | undefined): string {
  let name = raw || 'Control'
  for (const prefix of CONTROL_NAME_PREFIXES) {
    if (name.toUpperCase().startsWith(prefix)) {
      name = name.substring(prefix.length).trim()
      break
    }
  }
  if (name.startsWith('- ')) name = name.substring(2).trim()
  else if (name.startsWith('-')) name = name.substring(1).trim()
  return name
}

// Reject POIs whose nearest track point is farther than this; they likely
// aren't on the route and shouldn't be auto-imported.
const MAX_POI_OFFROUTE_METERS = 500

// Controls whose cumulative distance differs by less than this are treated
// as the same control (collapses course-point + waypoint duplicates).
const DEDUPE_THRESHOLD_METERS = 100

// Physical-distance threshold for collapsing same-type POIs that represent
// the same stop (e.g., a "Start: Waterloo" label POI and a "CONTROL Start
// A&W" control POI, both type `start`, both sitting at the same parking
// lot). Applied to raw POI lat/lng before distance interpolation, because
// co-located POIs can otherwise interpolate onto different track points on
// a loop route and escape the distance-along-route dedupe. Only applies to
// POIs of the same `poi_type_name`, so legitimate separate controls can
// still sit within 200 m of each other.
const POI_PHYSICAL_DEDUPE_METERS = 200

function hasControlNamePrefix(name: string | undefined): boolean {
  if (!name) return false
  const upper = name.toUpperCase()
  return CONTROL_NAME_PREFIXES.some((p) => upper.startsWith(p))
}

function parseCoursePointControls(route: RwgpsRoute): InternalControl[] {
  const points = route.course_points ?? []
  return points
    .filter((cp) => cp.t === 'Control')
    .map<InternalControl>((cp) => ({
      name: cleanControlName(cp.n),
      distanceKm: (cp.d ?? 0) / 1000,
      source: 'course',
    }))
}

function poiSourceFor(poiTypeName: string | undefined): Source | null {
  if (!poiTypeName) return null
  return CONTROL_POI_TYPES[poiTypeName] ?? null
}

type InterpolationBias = 'start' | 'finish' | 'none'

/**
 * Find the track point closest to (lat, lng) and return its cumulative
 * distance along the route.
 *
 * On loop/out-and-back routes the same physical location appears twice in
 * track_points (once near `d=0`, once near `d=total`), so a POI placed
 * there can legitimately match either track point. The `bias` argument
 * breaks that ambiguity — for a `start`-typed POI, prefer the start-end
 * candidate; for a `finish`-typed POI, prefer the finish-end.
 */
function findNearestTrackPointDistanceMeters(
  lat: number,
  lng: number,
  trackPoints: RwgpsTrackPoint[],
  bias: InterpolationBias = 'none'
): { distanceMeters: number; offsetMeters: number } | null {
  let bestDistance: number | null = null
  let bestOffset = Infinity
  for (const tp of trackPoints) {
    if (tp.y == null || tp.x == null || tp.d == null) continue
    const offset = haversineMeters(lat, lng, tp.y, tp.x)
    const isStrictlyCloser = offset < bestOffset
    const isTie = offset === bestOffset
    const tieWinsByBias =
      isTie &&
      bestDistance != null &&
      ((bias === 'finish' && tp.d > bestDistance) || (bias === 'start' && tp.d < bestDistance))
    if (isStrictlyCloser || tieWinsByBias) {
      bestOffset = offset
      bestDistance = tp.d
    }
  }
  if (bestDistance == null) return null
  return { distanceMeters: bestDistance, offsetMeters: bestOffset }
}

function biasForPoiType(poiTypeName: string | undefined): InterpolationBias {
  if (poiTypeName === 'start') return 'start'
  if (poiTypeName === 'finish') return 'finish'
  return 'none'
}

function dedupeCoLocatedPois(pois: RwgpsPoi[]): RwgpsPoi[] {
  const kept: RwgpsPoi[] = []
  for (const p of pois) {
    if (p.lat == null || p.lng == null) continue
    const idx = kept.findIndex(
      (k) =>
        k.poi_type_name === p.poi_type_name &&
        haversineMeters(p.lat!, p.lng!, k.lat!, k.lng!) < POI_PHYSICAL_DEDUPE_METERS
    )
    if (idx === -1) {
      kept.push(p)
      continue
    }
    // Overlap: prefer the entry whose name carries an explicit CONTROL-style
    // prefix, since that signals the organizer's intent for the stop.
    const existing = kept[idx]
    if (hasControlNamePrefix(p.name) && !hasControlNamePrefix(existing.name)) {
      kept[idx] = p
    }
  }
  return kept
}

function parsePoiControls(route: RwgpsRoute): InternalControl[] {
  const trackPoints = route.track_points ?? []
  if (trackPoints.length === 0) return []

  const candidates = (route.points_of_interest ?? []).filter(
    (p) => poiSourceFor(p.poi_type_name) != null
  )
  const pois = dedupeCoLocatedPois(candidates)

  const result: InternalControl[] = []
  for (const poi of pois) {
    const source = poiSourceFor(poi.poi_type_name)
    if (!source) continue
    if (poi.lat == null || poi.lng == null) continue
    const match = findNearestTrackPointDistanceMeters(
      poi.lat,
      poi.lng,
      trackPoints,
      biasForPoiType(poi.poi_type_name)
    )
    if (!match) continue
    if (match.offsetMeters > MAX_POI_OFFROUTE_METERS) continue
    result.push({
      name: cleanControlName(poi.name),
      distanceKm: match.distanceMeters / 1000,
      source,
    })
  }
  return result
}

function dedupeControls(controls: InternalControl[]): InternalControl[] {
  // Sort by source priority first so higher-priority entries (control POIs,
  // then start/finish POIs, then course points) get added first and their
  // near-duplicates are dropped. Ties within a priority break by distance
  // for stable output.
  const ordered = [...controls].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source]
    const pb = SOURCE_PRIORITY[b.source]
    if (pa !== pb) return pa - pb
    return a.distanceKm - b.distanceKm
  })
  const kept: InternalControl[] = []
  for (const c of ordered) {
    const isDuplicate = kept.some(
      (k) => Math.abs(k.distanceKm - c.distanceKm) * 1000 < DEDUPE_THRESHOLD_METERS
    )
    if (!isDuplicate) kept.push(c)
  }
  return kept.sort((a, b) => a.distanceKm - b.distanceKm)
}

/**
 * Extract, merge, and dedupe controls from an RWGPS route JSON response.
 * Controls may come from two sources:
 *   - `course_points` with `t === 'Control'` (distance comes from `cp.d`)
 *   - `points_of_interest` with `poi_type_name` in {`control`, `start`, `finish`}
 *     (lat/lng only; distance interpolated from nearest `track_points` entry)
 *
 * When entries collide within 100 m along the route, precedence is
 * control POI > start/finish POI > course point, because POI names tend to
 * be more descriptive than the short course instruction text.
 */
export function extractControls(route: RwgpsRoute): ParsedControl[] {
  const course = parseCoursePointControls(route)
  const poi = parsePoiControls(route)
  const merged = dedupeControls([...course, ...poi])
  return merged.map((c) => ({
    name: c.name,
    distance: c.distanceKm.toFixed(1),
  }))
}

/**
 * Fetch an RWGPS route JSON and return the controls to pre-fill on a
 * control-card form. Throws Error with a user-facing message on any
 * failure.
 */
export async function fetchRwgpsControls(rwgpsId: string): Promise<ParsedControl[]> {
  const url = `https://ridewithgps.com/routes/${rwgpsId}.json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
  }
  const data: unknown = await response.json()
  // RWGPS sometimes nests the route under a `route` key; sometimes it's at the top level.
  const route = (data as { route?: RwgpsRoute }).route ?? (data as RwgpsRoute)
  const controls = extractControls(route)
  if (controls.length === 0) {
    throw new Error(
      'No control points found in the RWGPS route. Add controls as course points (type "Control") or waypoints (comment "control") in the RideWithGPS route editor.'
    )
  }
  return controls
}
