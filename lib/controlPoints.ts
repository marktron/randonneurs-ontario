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
 * matched, or `null` for a genuinely new control. Matching is greedy in two
 * passes — trimmed, case-insensitive name first, then distance within 0.1 km
 * among whatever is still unmatched — and each saved row matches at most once.
 */
export function matchImportedControls<S extends ControlNameDistance>(
  imported: ControlNameDistance[],
  saved: readonly S[]
): (S | null)[] {
  const used = new Array(saved.length).fill(false)
  const result: (S | null)[] = new Array(imported.length).fill(null)
  const norm = (s: string) => s.trim().toLowerCase()

  // Pass 1: exact (normalized) name match.
  imported.forEach((imp, i) => {
    const target = norm(imp.name)
    const idx = saved.findIndex((s, j) => !used[j] && norm(s.name) === target)
    if (idx !== -1) {
      used[idx] = true
      result[i] = saved[idx]
    }
  })

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
