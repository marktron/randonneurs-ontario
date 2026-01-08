// brmTimes.ts — ACP/BRM control times with 1200/1300 support

export type NominalDistance = 200 | 300 | 400 | 600 | 1000 | 1200 | 1300

export type Options = {
  /** Truncate distances to whole km before computing. Default: true */
  truncateKm?: boolean
}

const FINISH_LIMITS_MIN: Record<NominalDistance, number> = {
  200: 13 * 60 + 30,
  300: 20 * 60,
  400: 27 * 60,
  600: 40 * 60,
  1000: 75 * 60,
  1200: 90 * 60,
  1300: 93 * 60,
}

// Opening speeds by segment (km/h)
const OPEN_SEGMENTS = [
  { upToKm: 200, v: 34 },
  { upToKm: 400, v: 32 },
  { upToKm: 600, v: 30 },
  { upToKm: 1000, v: 28 },
  { upToKm: 1300, v: 26 },
] as const

/**
 * Closing time in hours for distance d (km):
 *  - 0–60 km: 1 h + d/20
 *  - 60–600 km: 15 km/h
 *  - 600–1000 km: 11.428 km/h
 *  - 1000–1300 km: 13.333 km/h
 */
function closeHours(d: number): number {
  if (d <= 0) return 1 // 1 hour for start control (km 0)

  // First 0–60 band: "1h + d/20" (applies only to the portion within that band)
  const firstSpan = Math.min(d, 60)
  let h = 1 + firstSpan / 20

  let remaining = d - firstSpan
  if (remaining <= 0) return h

  // 60–600 at 15 km/h
  const span2 = Math.min(remaining, Math.max(0, 600 - 60)) // up to 540 km
  h += span2 / 15
  remaining -= span2
  if (remaining <= 0) return h

  // 600–1000 at 11.428 km/h
  const span3 = Math.min(remaining, Math.max(0, 1000 - 600)) // up to 400 km
  h += span3 / 11.428
  remaining -= span3
  if (remaining <= 0) return h

  // 1000–1300 at 13.333 km/h
  h += remaining / 13.333
  return h
}

function openHours(d: number): number {
  let remaining = d
  let hours = 0
  let lastEdge = 0
  for (const seg of OPEN_SEGMENTS) {
    const span = Math.max(0, Math.min(remaining, seg.upToKm - lastEdge))
    if (span > 0) {
      hours += span / seg.v
      remaining -= span
      lastEdge = seg.upToKm
    }
    if (remaining <= 0) break
  }
  return hours
}

function addMinutes(t: Date, minutes: number): Date {
  const d = new Date(t)
  d.setMinutes(d.getMinutes() + minutes)
  return d
}

/**
 * Compute opening & closing times for a control.
 * - Opening: 34/32/30/28/26 km/h by segment (to 1300)
 * - Closing: 1h + d/20 for first 60 km, then 15 km/h to 600, 11.428 to 1000, 13.333 to 1300
 * - Finish control is clamped to official overall limit (200–1300)
 */
export function computeControlTimes(
  start: Date,
  controlKm: number,
  nominalKm: NominalDistance,
  routeKm?: number,
  opts: Options = {}
) {
  const { truncateKm = true } = opts

  const dCtrl = truncateKm ? Math.trunc(controlKm) : controlKm
  const dRoute = routeKm == null ? nominalKm : (truncateKm ? Math.trunc(routeKm) : routeKm)

  // Opening
  const openMin = Math.round(openHours(dCtrl) * 60)
  const openAt = addMinutes(start, openMin)

  // Closing
  let closeMin = Math.round(closeHours(dCtrl) * 60)

  // Finish detection should use the *route length* (actual if provided, else nominal),
  // but the cutoff must use the *nominal* distance.
  const isFinish = dCtrl >= dRoute - 1e-4
  if (isFinish) {
    closeMin = FINISH_LIMITS_MIN[nominalKm]
  }

  const closeAt = addMinutes(start, closeMin)
  return { openAt, closeAt, openMin, closeMin }
}

/**
 * Format minutes as HH:MM
 */
export function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Get the nominal BRM distance for a given actual distance
 */
export function getNominalDistance(distance: number): NominalDistance {
  if (distance <= 200) return 200
  if (distance <= 300) return 300
  if (distance <= 400) return 400
  if (distance <= 600) return 600
  if (distance <= 1000) return 1000
  if (distance <= 1200) return 1200
  return 1300
}

/**
 * Format a date/time for control card display
 * Returns format like "Thu 04h30"
 */
export function formatControlTime(date: Date): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = dayNames[date.getDay()]
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${hours}h${minutes}`
}

/**
 * Format a date for card display (e.g., "Jan 08 2026")
 */
export function formatCardDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[date.getMonth()]
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${month} ${day} ${year}`
}
