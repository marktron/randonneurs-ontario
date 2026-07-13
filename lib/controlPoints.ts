interface ControlInput {
  id: string
  name: string
  distance: string
}

/**
 * Reverse control points for a route ridden in the opposite direction.
 * Reverses the array order and recalculates distances as (totalDistance - originalDistance).
 */
export function reverseControls(controls: ControlInput[], totalDistance: number): ControlInput[] {
  return [...controls].reverse().map((control) => ({
    ...control,
    distance: (totalDistance - parseFloat(control.distance)).toFixed(1),
  }))
}

/**
 * Check if an event name indicates a reversed permanent route.
 */
export function isReversedEvent(eventName: string): boolean {
  return eventName.includes('(Reversed)')
}

/**
 * Minimal control shape for matching/sync comparisons: an identifying name and
 * a route distance in km.
 */
export interface ControlNameDistance {
  name: string
  distanceKm: number
}

/** Distance tolerance (km) for matching imported controls to saved ones. */
const MATCH_DISTANCE_TOLERANCE_KM = 0.1

/**
 * Match freshly-imported controls to the event's already-saved controls so a
 * re-import preserves each saved row's id (and its downstream check-ins),
 * radius, and notes.
 *
 * Returns an array aligned to `imported`: each element is the saved control it
 * matched, or `null` for a genuinely new control. Matching runs in two passes
 * — trimmed, case-insensitive name first (closest distance wins when a name
 * repeats, e.g. a control the route passes twice), then distance within
 * 0.1 km among whatever is still unmatched — and each saved row matches at
 * most once.
 */
export function matchImportedControls<S extends ControlNameDistance>(
  imported: ControlNameDistance[],
  saved: readonly S[]
): (S | null)[] {
  const used = new Array(saved.length).fill(false)
  const result: (S | null)[] = new Array(imported.length).fill(null)
  const norm = (s: string) => s.trim().toLowerCase()

  // Pass 1: exact (normalized) name match, assigning closest-distance pairs
  // first so repeated names (multi-pass controls) map to the right visit.
  const namePairs: { i: number; j: number; delta: number }[] = []
  imported.forEach((imp, i) => {
    const target = norm(imp.name)
    saved.forEach((s, j) => {
      if (norm(s.name) === target) {
        namePairs.push({ i, j, delta: Math.abs(s.distanceKm - imp.distanceKm) })
      }
    })
  })
  namePairs.sort((a, b) => a.delta - b.delta)
  for (const { i, j } of namePairs) {
    if (result[i] || used[j]) continue
    used[j] = true
    result[i] = saved[j]
  }

  // Pass 2: distance match within tolerance, for imported rows still unmatched.
  imported.forEach((imp, i) => {
    if (result[i]) return
    const idx = saved.findIndex(
      (s, j) =>
        !used[j] && Math.abs(s.distanceKm - imp.distanceKm) <= MATCH_DISTANCE_TOLERANCE_KM + 1e-9
    )
    if (idx !== -1) {
      used[idx] = true
      result[i] = saved[idx]
    }
  })

  return result
}

/**
 * Whether the current control rows match the saved digital-card controls,
 * comparing the ordered sequence of (trimmed name, numeric distance) pairs.
 * Order matters: reordering rows counts as drift.
 */
export function controlsInSync(rows: ControlNameDistance[], saved: ControlNameDistance[]): boolean {
  if (rows.length !== saved.length) return false
  return rows.every((row, i) => {
    const s = saved[i]
    return row.name.trim() === s.name.trim() && row.distanceKm === s.distanceKm
  })
}

/** Maximum controls a printed card back can hold (3 columns × 8 rows). */
export const MAX_CARD_CONTROLS = 24

export type BackCardTier = 'normal' | 'compact' | 'dense' | 'ultra'

/**
 * Layout for the printed card back: how many control rows each of the 3
 * columns holds, and which typography tier applies. Rows per column is
 * ceil(count / 3) clamped to [4, 8]; counts above MAX_CARD_CONTROLS are the
 * callers' responsibility to reject — this clamps rather than throws.
 */
export function backCardLayout(controlCount: number): {
  rowsPerColumn: number
  tier: BackCardTier
} {
  const rowsPerColumn = Math.min(8, Math.max(4, Math.ceil(controlCount / 3)))
  const tier: BackCardTier =
    controlCount <= 12
      ? 'normal'
      : controlCount <= 18
        ? 'compact'
        : controlCount <= 21
          ? 'dense'
          : 'ultra'
  return { rowsPerColumn, tier }
}
