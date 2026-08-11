import { FINISH_LIMITS_MIN, getNominalDistance } from '@/lib/brmTimes'
import { parseLocalDate } from '@/lib/utils'

export interface FinishDayOption {
  /** 0 = same day as event start, 1 = next day, etc. */
  offset: number
  /** YYYY-MM-DD in local calendar */
  date: string
  /** Short label, e.g. "Sat May 17" */
  label: string
}

/** Strict ACP elapsed-time limit in minutes for the route's distance. */
export function getAcpTimeLimitMinutes(distanceKm: number): number {
  // LRM rule: randonnées of 1400 km and up are limited to an overall 12 km/h
  // global average, not a further extension of the ACP banded table (which
  // only defines limits through 1300 km).
  if (distanceKm > 1300) {
    return Math.round((distanceKm / 12) * 60)
  }
  return FINISH_LIMITS_MIN[getNominalDistance(distanceKm)]
}

/**
 * Calendar days a rider could plausibly choose as their finish day, from the
 * event date through one day past the strict ACP/LRM cutoff (so over-limit
 * finishes can still be recorded). Returns an empty array if the event has no
 * start time recorded — callers should fall back to an elapsed-time input in
 * that case.
 */
export function getFinishDayOptions(
  eventDate: string,
  startTime: string | null,
  distanceKm: number
): FinishDayOption[] {
  if (!startTime) return []
  const [sh, sm] = startTime.split(':').map(Number)
  if (Number.isNaN(sh) || Number.isNaN(sm)) return []

  const limitMin = getAcpTimeLimitMinutes(distanceKm)
  const totalMin = sh * 60 + sm + limitMin
  // Number of distinct calendar days the start..cutoff window spans, plus one
  // extra day: riders may finish past the ACP/LRM cutoff and still need to
  // record their real finish (the form flags over-limit elapsed but accepts
  // it), so the picker must offer a day beyond the strict-limit window.
  const dayCount = Math.floor(totalMin / (24 * 60)) + 1 + 1

  const startDate = parseLocalDate(eventDate)
  const options: FinishDayOption[] = []
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    options.push({
      offset: i,
      date: formatYmd(d),
      label: d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    })
  }
  return options
}

/**
 * Wall-clock elapsed minutes between the event start and the rider's stated
 * finish time on day `dayOffset` (0 = same day). Returns null when the inputs
 * don't describe a positive elapsed duration.
 *
 * Wall-clock arithmetic intentionally ignores DST transitions — ACP elapsed
 * time is reckoned by the rider's clock, not by physical hours.
 */
export function calculateElapsedMinutes(
  startTime: string,
  finishTime: string,
  dayOffset: number
): number | null {
  const [sh, sm] = startTime.split(':').map(Number)
  const [fh, fm] = finishTime.split(':').map(Number)
  if ([sh, sm, fh, fm].some((n) => Number.isNaN(n))) return null
  if (!Number.isInteger(dayOffset) || dayOffset < 0) return null

  const startMin = sh * 60 + sm
  const finishMin = dayOffset * 24 * 60 + fh * 60 + fm
  const elapsed = finishMin - startMin
  return elapsed > 0 ? elapsed : null
}

/**
 * Format elapsed minutes as the H:MM (or HHH:MM) string the submitRiderResult
 * action accepts. Pads minutes; never pads hours so the output matches the
 * action's `^\d{1,3}:\d{2}$` validator with the smallest possible footprint.
 */
export function formatElapsedForSubmission(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('formatElapsedForSubmission expects a non-negative finite number')
  }
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Human-readable elapsed time for inline confirmation, e.g. "13h 30m".
 */
export function formatElapsedForDisplay(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return ''
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
