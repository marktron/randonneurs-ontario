import type { CheckinFlags } from '@/lib/brevet-card'
import type { AdminCheckinGridRider } from '@/lib/actions/control-checkins'
import type {
  LocationContext,
  LocationFailureReason,
  LocationFailureStage,
} from '@/lib/location-diagnostics'

/**
 * Shared presentation helpers for digital-card check-ins, used by both the
 * admin check-ins grid and the results-table evidence modal. They live here
 * (not in the grid component) so the results page doesn't pull the grid's
 * static imports — checkin-map and its leaflet CSS — into its bundle.
 */

export const FLAG_LABELS: Array<{ key: keyof CheckinFlags; label: string; title: string }> = [
  { key: 'outOfRadius', label: 'radius', title: 'GPS fix was outside the control radius' },
  { key: 'noGps', label: 'no gps', title: 'Checked in without a GPS fix' },
  { key: 'early', label: 'early', title: 'Before the control opened' },
  { key: 'late', label: 'late', title: 'After the control closed' },
  { key: 'lateSync', label: 'late sync', title: 'Synced well after the tap (offline outbox)' },
]

function formatDistanceMetres(distanceToControlM: number): string {
  return distanceToControlM < 1000
    ? `${Math.round(distanceToControlM)} m`
    : `${(distanceToControlM / 1000).toFixed(1)} km`
}

function hasUsableAccuracy(accuracyM: number | null): accuracyM is number {
  return accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0
}

/**
 * Formats the "GPS fix recorded X from the control" caption shown in the
 * correction dialog: metres under 1 km ("320 m"), one-decimal km at/above
 * ("2.4 km"), with accuracy appended when known.
 */
export function formatCheckinDistanceLabel(
  distanceToControlM: number,
  accuracyM: number | null
): string {
  const distanceLabel = formatDistanceMetres(distanceToControlM)
  const accuracyLabel = hasUsableAccuracy(accuracyM)
    ? ` (±${Math.round(accuracyM)} m accuracy)`
    : ''
  return `GPS fix recorded ${distanceLabel} from the control${accuracyLabel}`
}

/**
 * Compact per-row variant for the evidence dialog, where the caption
 * repeats for every control: "29.0 km from control (±35 m)".
 */
export function formatCheckinDistanceCompact(
  distanceToControlM: number,
  accuracyM: number | null
): string {
  const accuracyLabel = hasUsableAccuracy(accuracyM) ? ` (±${Math.round(accuracyM)} m)` : ''
  return `${formatDistanceMetres(distanceToControlM)} from control${accuracyLabel}`
}

const FAILURE_REASON_LABELS: Record<LocationFailureReason, string> = {
  insecure_context: 'Location requires a secure connection',
  unsupported: 'Location is not supported by this browser',
  permission_denied: 'Location permission was denied',
  position_unavailable: 'Location was unavailable',
  timeout: 'Location timed out',
  request_error: 'Location request failed',
}

const FAILURE_STAGE_LABELS: Record<LocationFailureStage, string> = {
  preflight: 'preflight',
  quick: 'the quick attempt',
  high_accuracy: 'the high-accuracy attempt',
}

const LOCATION_CONTEXT_LABELS: Record<LocationContext, string> = {
  browser: 'browser',
  standalone: 'standalone web app',
  embedded: 'embedded browser',
}

function formatLocationElapsed(elapsedMs: number): string {
  if (elapsedMs < 1000) return `${Math.round(elapsedMs)} ms`
  const seconds = elapsedMs / 1000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
}

/**
 * Turns the bounded diagnostic stored with a no-GPS check-in into a concise
 * organizer-facing explanation. Legacy/manual rows without diagnostics have
 * no summary rather than an invented cause.
 */
export function formatLocationFailureSummary(diagnostic: {
  locationFailureReason: LocationFailureReason | null
  locationFailureStage: LocationFailureStage | null
  locationElapsedMs: number | null
  locationContext: LocationContext | null
}): string | null {
  if (!diagnostic.locationFailureReason) return null

  let summary = FAILURE_REASON_LABELS[diagnostic.locationFailureReason]
  if (diagnostic.locationFailureStage) {
    summary += ` during ${FAILURE_STAGE_LABELS[diagnostic.locationFailureStage]}`
  }
  if (
    diagnostic.locationElapsedMs != null &&
    Number.isFinite(diagnostic.locationElapsedMs) &&
    diagnostic.locationElapsedMs >= 0
  ) {
    summary += ` after ${formatLocationElapsed(diagnostic.locationElapsedMs)}`
  }
  if (diagnostic.locationContext) {
    summary += ` (${LOCATION_CONTEXT_LABELS[diagnostic.locationContext]})`
  }
  return summary
}

export interface CheckinEvidenceCheckin {
  checkedInAt: string
  method: string
  flags: CheckinFlags
  distanceToControlM: number | null
  accuracyM: number | null
  locationFailureReason: LocationFailureReason | null
  locationFailureStage: LocationFailureStage | null
  locationElapsedMs: number | null
  locationContext: LocationContext | null
  note: string | null
}

export interface CheckinEvidenceControl {
  name: string
  distanceKm: number
  /** null = the rider did not check in at this control. */
  checkin: CheckinEvidenceCheckin | null
}

/** riderId → per-control rows, only for riders with at least one check-in. */
export type CheckinEvidence = Record<string, CheckinEvidenceControl[]>

/**
 * Joins event controls with per-registration check-ins into the compact map
 * the results table's evidence modal renders from. Controls are ordered by
 * position; riders with zero check-ins are omitted entirely.
 */
export function buildCheckinEvidence(
  controls: Array<{ id: string; position: number; name: string; distanceKm: number }>,
  riders: AdminCheckinGridRider[]
): CheckinEvidence {
  const ordered = [...controls].sort((a, b) => a.position - b.position)
  const evidence: CheckinEvidence = {}

  for (const rider of riders) {
    if (ordered.length === 0 || rider.checkins.length === 0) continue
    const byControlId = new Map(rider.checkins.map((c) => [c.controlId, c]))
    evidence[rider.riderId] = ordered.map((control) => {
      const checkin = byControlId.get(control.id)
      return {
        name: control.name,
        distanceKm: control.distanceKm,
        checkin: checkin
          ? {
              checkedInAt: checkin.checkedInAt,
              method: checkin.method,
              flags: checkin.flags,
              distanceToControlM: checkin.distanceToControlM,
              accuracyM: checkin.accuracyM,
              locationFailureReason: checkin.locationFailureReason,
              locationFailureStage: checkin.locationFailureStage,
              locationElapsedMs: checkin.locationElapsedMs,
              locationContext: checkin.locationContext,
              note: checkin.note,
            }
          : null,
      }
    })
  }

  return evidence
}
