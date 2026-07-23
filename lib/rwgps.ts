import { haversineMeters } from '@/lib/geo'

export interface ParsedControl {
  name: string
  distance: string // km, formatted to one decimal
}

/**
 * ParsedControl plus coordinates, for consumers that need a physical
 * location (e.g. digital brevet card GPS check-ins). Coordinates are null
 * when RWGPS provides none for the point and none can be interpolated.
 */
export interface ParsedControlWithCoords extends ParsedControl {
  lat: number | null
  lng: number | null
  /**
   * Free-text note for the control, taken from the RWGPS POI `description`
   * field. Shown on the digital brevet card (never on the printed card).
   * Null for course-point controls, which carry no description.
   */
  notes: string | null
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
  lat: number | null
  lng: number | null
  notes: string | null
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
  x?: number // lng
  y?: number // lat
}

interface RwgpsPoi {
  name?: string
  lat?: number
  lng?: number
  poi_type_name?: string
  description?: string
}

interface RwgpsTrackPoint {
  x?: number // lng
  y?: number // lat
  d?: number // meters from route start
}

interface RwgpsRoute {
  name?: string
  distance?: number // meters
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
 * Parse a RideWithGPS route reference from a URL, share link, or bare ID.
 * Returns the numeric route ID plus a privacy_code if present (RWGPS uses
 * privacy_code on share links to grant view access to private routes).
 */
export function parseRwgpsRouteRef(
  input: string
): { id: string; privacyCode: string | null } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fromUrl = trimmed.match(/\/routes\/(\d+)/)
  const fromBare = !fromUrl ? trimmed.match(/^(\d+)$/) : null
  const id = fromUrl?.[1] ?? fromBare?.[1] ?? null
  if (!id) return null

  const privacyMatch = trimmed.match(/[?&]privacy_code=([^&\s#]+)/)
  const privacyCode = privacyMatch ? decodeURIComponent(privacyMatch[1]) : null

  return { id, privacyCode }
}

export interface RwgpsRefs {
  rwgpsId: string | null
  rwgpsCollectionId: string | null
}

/**
 * Parse the admin form's single "Ride With GPS Link" field, which accepts
 * either a route URL/ID or a collection URL. Exactly one of the two ids is
 * non-null for non-empty input (they are mutually exclusive in the DB).
 * Route parsing preserves the legacy lenient behavior: bare numeric ids,
 * ambassador_routes/trips URLs, and a fall-through that returns the trimmed
 * input as-is.
 */
export function extractRwgpsRefs(input: string | null | undefined): RwgpsRefs {
  const none: RwgpsRefs = { rwgpsId: null, rwgpsCollectionId: null }
  if (!input) return none
  const trimmed = input.trim()
  if (!trimmed) return none

  const collectionMatch = trimmed.match(/ridewithgps\.com\/collections\/(\d+)/)
  if (collectionMatch) {
    return { rwgpsId: null, rwgpsCollectionId: collectionMatch[1] }
  }

  if (/^\d+$/.test(trimmed)) {
    return { rwgpsId: trimmed, rwgpsCollectionId: null }
  }

  const routePatterns = [
    /ridewithgps\.com\/routes\/(\d+)/,
    /ridewithgps\.com\/ambassador_routes\/(\d+)/,
    /ridewithgps\.com\/trips\/(\d+)/,
  ]
  for (const pattern of routePatterns) {
    const match = trimmed.match(pattern)
    if (match) return { rwgpsId: match[1], rwgpsCollectionId: null }
  }

  // Fall through: keep whatever was pasted so the admin can see and fix it.
  return { rwgpsId: trimmed, rwgpsCollectionId: null }
}

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
  const trackPoints = route.track_points ?? []
  return points
    .filter((cp) => cp.t === 'Control')
    .map<InternalControl>((cp) => {
      // Course points usually carry x/y; when absent, interpolate from the
      // track point nearest along the route to the course point's distance.
      let lat = cp.y ?? null
      let lng = cp.x ?? null
      if ((lat == null || lng == null) && cp.d != null) {
        const nearest = findTrackPointNearestDistance(cp.d, trackPoints)
        if (nearest) {
          lat = nearest.y ?? null
          lng = nearest.x ?? null
        }
      }
      return {
        name: cleanControlName(cp.n),
        distanceKm: (cp.d ?? 0) / 1000,
        source: 'course',
        lat,
        lng,
        notes: null,
      }
    })
}

/** Track point whose cumulative distance is closest to `distanceMeters`. */
function findTrackPointNearestDistance(
  distanceMeters: number,
  trackPoints: RwgpsTrackPoint[]
): RwgpsTrackPoint | null {
  let best: RwgpsTrackPoint | null = null
  let bestDelta = Infinity
  for (const tp of trackPoints) {
    if (tp.d == null || tp.x == null || tp.y == null) continue
    const delta = Math.abs(tp.d - distanceMeters)
    if (delta < bestDelta) {
      bestDelta = delta
      best = tp
    }
  }
  return best
}

function poiSourceFor(poiTypeName: string | undefined): Source | null {
  if (!poiTypeName) return null
  return CONTROL_POI_TYPES[poiTypeName] ?? null
}

// Along-route gap that separates two visits to the same POI. While the route
// stays within MAX_POI_OFFROUTE_METERS of the POI, successive in-range track
// points are at most a few dozen meters apart; leaving the radius for more
// than this much route and returning is a genuine re-pass.
const PASS_GAP_METERS = 1000

/**
 * Find every pass the route makes by (lat, lng): each cluster of in-range
 * track points (within MAX_POI_OFFROUTE_METERS, split where the along-route
 * gap exceeds PASS_GAP_METERS) yields its closest point's cumulative
 * distance. Loop and out-and-back routes visit the same physical control
 * more than once, and each visit is its own control on the card.
 *
 * `trackPoints` must be sorted by cumulative distance.
 */
function findRoutePasses(
  lat: number,
  lng: number,
  trackPoints: RwgpsTrackPoint[]
): { distanceMeters: number; offsetMeters: number }[] {
  const passes: { distanceMeters: number; offsetMeters: number }[] = []
  let current: { distanceMeters: number; offsetMeters: number; lastD: number } | null = null
  for (const tp of trackPoints) {
    if (tp.y == null || tp.x == null || tp.d == null) continue
    const offset = haversineMeters(lat, lng, tp.y, tp.x)
    if (offset > MAX_POI_OFFROUTE_METERS) continue
    if (current && tp.d - current.lastD > PASS_GAP_METERS) {
      passes.push({ distanceMeters: current.distanceMeters, offsetMeters: current.offsetMeters })
      current = null
    }
    if (!current) {
      current = { distanceMeters: tp.d, offsetMeters: offset, lastD: tp.d }
    } else {
      current.lastD = tp.d
      if (offset < current.offsetMeters) {
        current.offsetMeters = offset
        current.distanceMeters = tp.d
      }
    }
  }
  if (current) {
    passes.push({ distanceMeters: current.distanceMeters, offsetMeters: current.offsetMeters })
  }
  return passes
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
  const trackPoints = [...(route.track_points ?? [])].sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
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
    const allPasses = findRoutePasses(poi.lat, poi.lng, trackPoints)
    if (allPasses.length === 0) continue
    // A control POI is a control at every visit. A start/finish POI marks one
    // endpoint: on loops the same spot is passed at km 0 and km total (and
    // sometimes mid-ride), so keep only the first pass for `start` and only
    // the last for `finish`.
    const passes =
      poi.poi_type_name === 'start'
        ? [allPasses[0]]
        : poi.poi_type_name === 'finish'
          ? [allPasses[allPasses.length - 1]]
          : allPasses
    for (const pass of passes) {
      result.push({
        name: cleanControlName(poi.name),
        distanceKm: pass.distanceMeters / 1000,
        source,
        lat: poi.lat,
        lng: poi.lng,
        notes: poi.description?.trim() || null,
      })
    }
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
  return extractControlsWithCoords(route).map(({ name, distance }) => ({ name, distance }))
}

/**
 * extractControls, but preserving each control's coordinates for consumers
 * that need physical locations (digital brevet card check-in radii).
 */
export function extractControlsWithCoords(route: RwgpsRoute): ParsedControlWithCoords[] {
  const course = parseCoursePointControls(route)
  const poi = parsePoiControls(route)
  const merged = dedupeControls([...course, ...poi])
  return merged.map((c) => ({
    name: c.name,
    distance: c.distanceKm.toFixed(1),
    lat: c.lat,
    lng: c.lng,
    notes: c.notes,
  }))
}

/**
 * Fetch an RWGPS route JSON and return its display name, total distance,
 * and parsed controls — used by the control-cards rwgps validation mode
 * for routes that aren't yet in the database. Throws Error with a
 * user-facing message on any failure.
 */
export async function fetchRwgpsRoute(
  rwgpsId: string,
  privacyCode?: string | null
): Promise<{ name: string; distanceKm: number; controls: ParsedControl[] }> {
  const base = `https://ridewithgps.com/routes/${rwgpsId}.json`
  const url = privacyCode ? `${base}?privacy_code=${encodeURIComponent(privacyCode)}` : base
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
  }
  const data: unknown = await response.json()
  const route = (data as { route?: RwgpsRoute }).route ?? (data as RwgpsRoute)
  const controls = extractControls(route)
  if (controls.length === 0) {
    throw new Error(
      'No control points found in the RWGPS route. Add controls as course points (type "Control") or waypoints (comment "control") in the RideWithGPS route editor.'
    )
  }
  return {
    name: route.name?.trim() || 'Untitled Route',
    distanceKm: typeof route.distance === 'number' ? route.distance / 1000 : 0,
    controls,
  }
}

/**
 * Fetch an RWGPS route JSON and return the controls to pre-fill on a
 * control-card form. Throws Error with a user-facing message on any
 * failure.
 */
export async function fetchRwgpsControls(rwgpsId: string): Promise<ParsedControl[]> {
  const controls = await fetchRwgpsControlsWithCoords(rwgpsId)
  return controls.map(({ name, distance }) => ({ name, distance }))
}

/**
 * fetchRwgpsControls, but preserving coordinates (digital brevet card
 * import). Throws Error with a user-facing message on any failure.
 */
export async function fetchRwgpsControlsWithCoords(
  rwgpsId: string
): Promise<ParsedControlWithCoords[]> {
  const url = `https://ridewithgps.com/routes/${rwgpsId}.json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
  }
  const data: unknown = await response.json()
  // RWGPS sometimes nests the route under a `route` key; sometimes it's at the top level.
  const route = (data as { route?: RwgpsRoute }).route ?? (data as RwgpsRoute)
  const controls = extractControlsWithCoords(route)
  if (controls.length === 0) {
    throw new Error(
      'No control points found in the RWGPS route. Add controls as course points (type "Control") or waypoints (comment "control") in the RideWithGPS route editor.'
    )
  }
  return controls
}
