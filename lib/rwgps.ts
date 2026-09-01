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

/**
 * Point of interest as returned by the authenticated v1 route API. `type` is
 * the lowercase machine type ('control', 'start', 'finish', 'restroom', …)
 * and `distances` holds one cumulative distance (meters from the route start)
 * per pass the route makes by the POI — five entries for a control the route
 * visits five times, and an empty array for a POI that isn't on the route.
 *
 * The unauthenticated `ridewithgps.com/routes/{id}.json` endpoint reports
 * neither field (it uses `poi_type_name` and omits distances entirely), which
 * is why control imports go through the v1 API.
 */
interface RwgpsPoi {
  name?: string
  lat?: number
  lng?: number
  type?: string
  distances?: number[]
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

/** Public page URL for a RWGPS collection. The only place this URL format lives. */
export function buildRwgpsCollectionUrl(id: string): string {
  return `https://ridewithgps.com/collections/${id}`
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

// Controls whose cumulative distance differs by less than this are treated
// as the same control (collapses course-point + waypoint duplicates).
const DEDUPE_THRESHOLD_METERS = 100

// Physical-distance threshold for collapsing same-type POIs that represent
// the same stop (e.g., a "Start: Waterloo" label POI and a "CONTROL Start
// A&W" control POI, both type `start`, both sitting at the same parking
// lot). Applied to raw POI lat/lng, because co-located POIs can report
// slightly different distances along the route and escape the
// distance-along-route dedupe. Only applies to POIs of the same `type`, so
// legitimate separate controls can still sit within 200 m of each other.
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

function poiSourceFor(poiType: string | undefined): Source | null {
  if (!poiType) return null
  return CONTROL_POI_TYPES[poiType] ?? null
}

function dedupeCoLocatedPois(pois: RwgpsPoi[]): RwgpsPoi[] {
  const kept: RwgpsPoi[] = []
  for (const p of pois) {
    if (p.lat == null || p.lng == null) continue
    const idx = kept.findIndex(
      (k) =>
        k.type === p.type &&
        haversineMeters(p.lat!, p.lng!, k.lat!, k.lng!) < POI_PHYSICAL_DEDUPE_METERS
    )
    if (idx === -1) {
      kept.push(p)
      continue
    }
    // Overlap: one physical stop marked with multiple pins. Prefer the name
    // with an explicit CONTROL-style prefix (that signals the organizer's
    // intent for the stop), but MERGE the pass distances — organizers
    // sometimes pin each pass of a loop separately (e.g. Waffle Day 1's
    // Chatham start and finish, RWGPS route 55952788), and dropping the
    // later pin wholesale would lose its passes. Entries within the
    // along-route dedupe threshold of an already-kept pass are the same
    // pass double-pinned, not a new one.
    const existing = kept[idx]
    const winner =
      hasControlNamePrefix(p.name) && !hasControlNamePrefix(existing.name) ? p : existing
    const mergedDistances = [...(existing.distances ?? [])]
    for (const d of p.distances ?? []) {
      if (!mergedDistances.some((m) => Math.abs(m - d) < DEDUPE_THRESHOLD_METERS)) {
        mergedDistances.push(d)
      }
    }
    kept[idx] = { ...winner, distances: mergedDistances }
  }
  return kept
}

function parsePoiControls(route: RwgpsRoute): InternalControl[] {
  const candidates = (route.points_of_interest ?? []).filter((p) => poiSourceFor(p.type) != null)
  const pois = dedupeCoLocatedPois(candidates)

  const result: InternalControl[] = []
  for (const poi of pois) {
    const source = poiSourceFor(poi.type)
    if (!source) continue
    if (poi.lat == null || poi.lng == null) continue
    // No distances means RWGPS couldn't place the POI on the route (it sits
    // off-route, or was never snapped to the track); skip it.
    const allDistances = [...(poi.distances ?? [])].sort((a, b) => a - b)
    if (allDistances.length === 0) continue
    // A control POI is a control at every pass. A start/finish POI marks one
    // endpoint: on loops the same spot is passed at km 0 and km total (and
    // sometimes mid-ride), so keep only the first pass for `start` and only
    // the last for `finish`.
    const distances =
      poi.type === 'start'
        ? [allDistances[0]]
        : poi.type === 'finish'
          ? [allDistances[allDistances.length - 1]]
          : allDistances
    for (const distanceMeters of distances) {
      result.push({
        name: cleanControlName(poi.name),
        distanceKm: distanceMeters / 1000,
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
 *   - `points_of_interest` with `type` in {`control`, `start`, `finish`}
 *     (one control per entry in the POI's `distances` array, so a control the
 *     route passes several times lands on the card once per pass)
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
 * Auth headers for the RWGPS v1 API. Throws a user-facing Error when the
 * credentials are missing — the route fetchers below surface their messages
 * straight to the organizer, so a misconfigured deployment says so rather
 * than failing as a bare 401.
 */
function rwgpsApiHeaders(): Record<string, string> {
  const apiKey = process.env.RWGPS_API_KEY
  const authToken = process.env.RWGPS_AUTH_TOKEN
  if (!apiKey || !authToken) {
    throw new Error(
      'RideWithGPS API access is not configured. Set RWGPS_API_KEY and RWGPS_AUTH_TOKEN.'
    )
  }
  return { 'x-rwgps-api-key': apiKey, 'x-rwgps-auth-token': authToken }
}

/**
 * Fetch an RWGPS route JSON and return its display name, total distance,
 * and parsed controls — used by the control-cards rwgps validation mode
 * for routes that aren't yet in the database. Throws Error with a
 * user-facing message on any failure.
 *
 * Uses the authenticated v1 API: only that endpoint reports each POI's
 * `distances` array, which is how multi-pass controls get one row per pass.
 */
export async function fetchRwgpsRoute(
  rwgpsId: string,
  privacyCode?: string | null
): Promise<{ name: string; distanceKm: number; controls: ParsedControl[] }> {
  const headers = rwgpsApiHeaders()
  const base = `https://ridewithgps.com/api/v1/routes/${rwgpsId}.json`
  const url = privacyCode ? `${base}?privacy_code=${encodeURIComponent(privacyCode)}` : base
  const response = await fetch(url, { headers })
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
 * import). Uses the authenticated v1 API for the POI `distances` array.
 * Throws Error with a user-facing message on any failure.
 */
export async function fetchRwgpsControlsWithCoords(
  rwgpsId: string
): Promise<ParsedControlWithCoords[]> {
  const headers = rwgpsApiHeaders()
  const url = `https://ridewithgps.com/api/v1/routes/${rwgpsId}.json`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
  }
  const data: unknown = await response.json()
  // The v1 API nests the route under a `route` key; tolerate a bare body too.
  const route = (data as { route?: RwgpsRoute }).route ?? (data as RwgpsRoute)
  const controls = extractControlsWithCoords(route)
  if (controls.length === 0) {
    throw new Error(
      'No control points found in the RWGPS route. Add controls as course points (type "Control") or waypoints (comment "control") in the RideWithGPS route editor.'
    )
  }
  return controls
}

export interface RwgpsCollectionRoute {
  id: number
  name: string
  distanceKm: number
  elevationGain: number
  htmlUrl: string
}

export interface RwgpsCollection {
  name: string
  htmlUrl: string
  routes: RwgpsCollectionRoute[]
}

interface RwgpsApiCollectionRoute {
  id?: number
  name?: string
  distance?: number // meters
  elevation_gain?: number // meters
  html_url?: string
}

/**
 * Fetch a RWGPS collection (group of routes, used for events beyond 1200 km)
 * via the authenticated v1 API. The v1 API ignores the collection's custom
 * sort order, so member routes are natural-sorted by name ("Leg 2" before
 * "Leg 10"). Returns null on missing credentials, HTTP errors, network
 * errors, malformed bodies, or an empty collection — callers fall back to a
 * plain link to the collection page. Cached ~1 hour via fetch revalidation.
 */
export async function fetchRwgpsCollection(collectionId: string): Promise<RwgpsCollection | null> {
  const apiKey = process.env.RWGPS_API_KEY
  const authToken = process.env.RWGPS_AUTH_TOKEN
  if (!apiKey || !authToken) {
    console.warn('fetchRwgpsCollection: RWGPS_API_KEY / RWGPS_AUTH_TOKEN not configured')
    return null
  }

  try {
    const response = await fetch(
      `https://ridewithgps.com/api/v1/collections/${collectionId}.json`,
      {
        headers: { 'x-rwgps-api-key': apiKey, 'x-rwgps-auth-token': authToken },
        next: { revalidate: 3600 },
      }
    )
    if (!response.ok) {
      console.warn(
        `fetchRwgpsCollection: ${response.status} ${response.statusText} for collection ${collectionId}`
      )
      return null
    }

    const data: unknown = await response.json()
    const collection = (
      data as {
        collection?: { name?: string; html_url?: string; routes?: RwgpsApiCollectionRoute[] }
      }
    ).collection
    const rawRoutes = collection?.routes ?? []
    if (!collection || rawRoutes.length === 0) return null

    const routes = rawRoutes
      .filter((r): r is RwgpsApiCollectionRoute & { id: number } => typeof r.id === 'number')
      .map((r) => ({
        id: r.id,
        name: r.name?.trim() || 'Untitled Route',
        distanceKm: (r.distance ?? 0) / 1000,
        elevationGain: r.elevation_gain ?? 0,
        htmlUrl: r.html_url ?? `https://ridewithgps.com/routes/${r.id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }))
    if (routes.length === 0) return null

    return {
      name: collection.name?.trim() || 'Route Collection',
      htmlUrl: collection.html_url ?? buildRwgpsCollectionUrl(collectionId),
      routes,
    }
  } catch (err) {
    console.warn(`fetchRwgpsCollection: failed for collection ${collectionId}`, err)
    return null
  }
}
