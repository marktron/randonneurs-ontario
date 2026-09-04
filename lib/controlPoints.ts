import type { CardLeg } from '@/types/control-card'

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

/**
 * True when a card title already ends with the event's distance, so appending
 * "{distance} km" after it would read as "Ottawa 200 200 km".
 *
 * Deliberately strict: it only matches a trailing number *equal* to the
 * distance. Randonneuring names are nominal ("Ottawa 200", "PBP 1200") while
 * the measured route is usually longer (203.4, 1219) — those are genuinely
 * different numbers and the real distance still has to be printed. A number
 * anywhere but the end of the title ("200 Loop of Ottawa") is not a
 * restatement either.
 */
export function titleStatesDistance(title: string, distanceKm: number): boolean {
  const trailingNumber = title.trim().match(/(\d+(?:\.\d+)?)\s*(?:km)?\.?$/i)
  if (!trailingNumber) return false
  return Number(trailingNumber[1]) === distanceKm
}

// ============================================================================
// Collection legs (per-leg control cards; see docs/control-cards.md)
// ============================================================================

export interface LegGroup<T> {
  legRwgpsId: string
  legName: string
  controls: T[]
}

/**
 * Group leg-tagged controls into legs in first-appearance order. Returns
 * null unless EVERY control carries the leg pair — a mixed or untagged list
 * is a single-route card (collection imports tag every row; anything else
 * falls back to today's behavior).
 *
 * `T` is intentionally left unconstrained beyond `object`: further
 * constraining it to require `legRwgpsId`/`legName` would make TypeScript's
 * array-literal inference apply that constraint as a contextual type and
 * reject any literal that doesn't already mention those fields
 * (excess-property check on e.g. `[{ name: 'Start' }]`), which is exactly
 * the untagged shape this function needs to accept. The leg fields are read
 * via a narrowed view instead.
 */
export function groupControlsByLeg<T extends object>(controls: T[]): LegGroup<T>[] | null {
  if (controls.length === 0) return null

  const legFields = controls as unknown as { legRwgpsId?: string | null; legName?: string | null }[]
  if (!legFields.every((c) => c.legRwgpsId != null && c.legName != null)) return null

  const groups: LegGroup<T>[] = []
  const byId = new Map<string, LegGroup<T>>()
  controls.forEach((control, i) => {
    const id = legFields[i].legRwgpsId!
    let group = byId.get(id)
    if (!group) {
      group = { legRwgpsId: id, legName: legFields[i].legName!, controls: [] }
      byId.set(id, group)
      groups.push(group)
    }
    group.controls.push(control)
  })
  return groups
}

/** A stored event_controls row, position-ordered, as needed for leg cards. */
export interface ControlRowForLegs {
  name: string
  distanceKm: number
  legRwgpsId: string | null
  legName: string | null
}

/**
 * Cumulative event distances for position-ordered, leg-tagged control rows.
 * New collection imports store distances that restart per leg, but some
 * older/manually-entered collection controls already contain cumulative
 * event distances. At each leg boundary, a distance below the previous
 * overall maximum signals a restart and receives that maximum as its offset;
 * a distance at or beyond the maximum is already cumulative and passes
 * through unchanged.
 *
 * Returns the offset distances aligned to `rows` (rounded to one decimal, the
 * stored precision), or null unless every row is leg-tagged — single-route
 * distances are already cumulative and pass through untouched.
 */
export function cumulativeLegDistanceKm(
  rows: { distanceKm: number; legRwgpsId?: string | null; legName?: string | null }[]
): number[] | null {
  if (rows.length === 0) return null
  if (!rows.every((row) => row.legRwgpsId != null && row.legName != null)) return null

  const out: number[] = []
  let offset = 0
  let currentLegId: string | null = null
  let currentLegOverallMax = 0
  for (const row of rows) {
    if (row.legRwgpsId !== currentLegId) {
      offset =
        currentLegId !== null && row.distanceKm < currentLegOverallMax ? currentLegOverallMax : 0
      currentLegId = row.legRwgpsId!
      currentLegOverallMax = 0
    }
    const overallDistance = Math.round((offset + row.distanceKm) * 10) / 10
    currentLegOverallMax = Math.max(currentLegOverallMax, overallDistance)
    out.push(overallDistance)
  }
  return out
}

/**
 * The distance a control's ACP open/close window is computed from. Fully
 * leg-tagged collection lists get their cumulative event distance (stored
 * per-leg distances restart at 0, but the event runs on one clock from the
 * event start); every other list keeps its stored distance, which is already
 * cumulative. Rows must be position-ordered.
 */
export function controlWindowDistancesKm(
  rows: { distanceKm: number; legRwgpsId?: string | null; legName?: string | null }[]
): number[] {
  return cumulativeLegDistanceKm(rows) ?? rows.map((row) => row.distanceKm)
}

/**
 * Flatten leg-tagged controls into one whole-event control list. Distances
 * become cumulative across legs, and the adjacent finish/start pair at each
 * leg boundary is collapsed because it represents the same checkpoint on a
 * single card. The earlier leg's finish label is retained.
 *
 * Returns null under the same all-or-nothing tagging rule as the other leg
 * helpers so untagged and mixed lists keep their single-route behavior.
 */
export function buildWholeEventControlsFromRows(
  rows: ControlRowForLegs[]
): ControlNameDistance[] | null {
  const cumulative = cumulativeLegDistanceKm(rows)
  if (!cumulative) return null

  const controls: ControlNameDistance[] = []
  rows.forEach((row, index) => {
    const previousRow = rows[index - 1]
    const previousControl = controls[controls.length - 1]
    const isSharedLegBoundary =
      previousRow != null &&
      previousRow.legRwgpsId !== row.legRwgpsId &&
      previousControl?.distanceKm === cumulative[index]

    if (!isSharedLegBoundary) {
      controls.push({ name: row.name, distanceKm: cumulative[index] })
    }
  })

  return controls
}

/**
 * Build the printed-card legs from the stored event_controls rows — the DB
 * is the source of truth at print time (leg control lists are too large to
 * round-trip through the print URL). Rows must be position-ordered; legs
 * come out in first-appearance order, each leg's distance is its largest
 * stored control distance (that day's ride, matching the leg's RWGPS route),
 * control distances stay per-leg with legs-2+ controls also carrying the
 * cumulative event distance (see `cumulativeLegDistanceKm`), and printed leg
 * controls carry no open/close times — the overall event limit governs on
 * paper. (The digital card computes windows from the cumulative distance;
 * see `controlWindowDistancesKm`.)
 *
 * Returns null unless every row is leg-tagged (mirrors `groupControlsByLeg`):
 * a mixed or untagged list is a single-route card.
 */
export function buildCardLegsFromRows(rows: ControlRowForLegs[]): CardLeg[] | null {
  const cumulative = cumulativeLegDistanceKm(rows)
  if (!cumulative) return null
  const groups = groupControlsByLeg(rows.map((row, i) => ({ ...row, cumulativeKm: cumulative[i] })))
  if (!groups) return null
  return groups.map((group, groupIndex) => ({
    legRwgpsId: group.legRwgpsId,
    legName: group.legName,
    distanceKm: Math.max(...group.controls.map((row) => row.distanceKm)),
    rwgpsUrl: `https://ridewithgps.com/routes/${group.legRwgpsId}`,
    controls: group.controls.map((row, index) => ({
      id: `leg-${groupIndex}-control-${index}`,
      name: row.name,
      distance: row.distanceKm,
      // Legs 2+ also carry the cumulative event distance; leg 1's would be
      // identical to the route distance, so it is omitted there.
      ...(groupIndex > 0 ? { overallDistance: row.cumulativeKm } : {}),
    })),
  }))
}

/**
 * Rider-major card expansion for collection events: all of rider 1's legs,
 * then rider 2's, ... The 2-per-sheet pairing consumes this stream.
 */
export function expandRiderLegCards<R, L>(riders: R[], legs: L[]): { rider: R; leg: L }[] {
  return riders.flatMap((rider) => legs.map((leg) => ({ rider, leg })))
}
