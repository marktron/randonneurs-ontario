import {
  MAX_LOCATION_ACCURACY_M,
  MAX_LOCATION_FAILURE_ELAPSED_MS,
  isValidCoordinatePair,
  type LocationContext,
  type LocationFailureDiagnostic,
  type LocationFailureReason,
  type LocationFailureStage,
} from '@/lib/location-diagnostics'

/** Fast path for a recent network/cached fix before waking the GPS radio. */
export const QUICK_LOCATION_TIMEOUT_MS = 5_000
export const QUICK_LOCATION_MAX_AGE_MS = 30_000

/** Cold GPS fixes on older phones can legitimately take tens of seconds. */
export const HIGH_ACCURACY_TIMEOUT_MS = 45_000

/** Accurate enough to identify a normal brevet control without waiting longer. */
export const USEFUL_LOCATION_ACCURACY_M = 100

/** Keep client output within the server's accepted GPS accuracy range. */
export const MAX_USABLE_LOCATION_ACCURACY_M = MAX_LOCATION_ACCURACY_M

export interface GeolocationFix {
  lat: number
  lng: number
  accuracyM: number
}

export interface GeolocationSource {
  getCurrentPosition(
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void
  watchPosition?(
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number
  clearWatch?(watchId: number): void
}

export type GeolocationAcquisitionResult =
  | {
      ok: true
      fix: GeolocationFix
      stage: Exclude<LocationFailureStage, 'preflight'>
      elapsedMs: number
    }
  | { ok: false; diagnostic: LocationFailureDiagnostic }

export interface AcquireGeolocationOptions {
  geolocation: GeolocationSource
  context: LocationContext
  signal?: AbortSignal
  onStageChange?: (stage: Exclude<LocationFailureStage, 'preflight'>) => void
  /** Test seams; production callers should use the defaults. */
  quickTimeoutMs?: number
  highAccuracyTimeoutMs?: number
  usefulAccuracyM?: number
  now?: () => number
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The location request was cancelled.', 'AbortError')
  }
  const error = new Error('The location request was cancelled.')
  error.name = 'AbortError'
  return error
}

function failureReason(error: GeolocationPositionError): LocationFailureReason {
  if (error.code === 1) return 'permission_denied'
  if (error.code === 2) return 'position_unavailable'
  if (error.code === 3) return 'timeout'
  return 'request_error'
}

type PositionRejection = 'malformed' | 'too_coarse'

/**
 * A usable fix, or why the reading cannot be used. The two rejections are
 * different failures: a malformed reading is a broken API response, while a
 * fix coarser than MAX_USABLE_LOCATION_ACCURACY_M means location worked and
 * simply could not place the rider.
 */
function positionFix(
  position: GeolocationPosition
): { ok: true; fix: GeolocationFix } | { ok: false; rejection: PositionRejection } {
  const { latitude, longitude, accuracy } = position.coords
  if (!isValidCoordinatePair(latitude, longitude) || !Number.isFinite(accuracy) || accuracy < 0) {
    return { ok: false, rejection: 'malformed' }
  }
  if (accuracy > MAX_LOCATION_ACCURACY_M) {
    return { ok: false, rejection: 'too_coarse' }
  }
  return {
    ok: true,
    fix: { lat: latitude, lng: longitude, accuracyM: Math.round(accuracy) },
  }
}

/**
 * Acquire a rider location in two stages.
 *
 * A recent low-power fix is tried first. If it is missing or imprecise, a
 * high-accuracy watch stays alive long enough for a cold GPS fix and retains
 * the most accurate position it sees. Browser TIMEOUT/POSITION_UNAVAILABLE
 * callbacks are advisory during that watch; our deadline is authoritative.
 */
export function acquireGeolocation({
  geolocation,
  context,
  signal,
  onStageChange,
  quickTimeoutMs = QUICK_LOCATION_TIMEOUT_MS,
  highAccuracyTimeoutMs = HIGH_ACCURACY_TIMEOUT_MS,
  usefulAccuracyM = USEFUL_LOCATION_ACCURACY_M,
  now = Date.now,
}: AcquireGeolocationOptions): Promise<GeolocationAcquisitionResult> {
  return new Promise((resolve, reject) => {
    const startedAt = now()
    let stage: Exclude<LocationFailureStage, 'preflight'> = 'quick'
    let settled = false
    let bestFix: GeolocationFix | null = null
    let highAccuracyFailure: LocationFailureReason | null = null
    let quickTimer: ReturnType<typeof setTimeout> | null = null
    let highAccuracyTimer: ReturnType<typeof setTimeout> | null = null
    let watchId: number | null = null

    const elapsedMs = () =>
      Math.min(MAX_LOCATION_FAILURE_ELAPSED_MS, Math.max(0, Math.round(now() - startedAt)))

    const cleanup = () => {
      if (quickTimer !== null) clearTimeout(quickTimer)
      if (highAccuracyTimer !== null) clearTimeout(highAccuracyTimer)
      quickTimer = null
      highAccuracyTimer = null
      if (watchId !== null && typeof geolocation.clearWatch === 'function') {
        try {
          geolocation.clearWatch(watchId)
        } catch {
          // Cleanup is best-effort; the acquisition has already settled.
        }
      }
      watchId = null
      signal?.removeEventListener('abort', onAbort)
    }

    const finish = (result: GeolocationAcquisitionResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const fail = (reason: LocationFailureReason) => {
      finish({
        ok: false,
        diagnostic: { reason, stage, elapsedMs: elapsedMs(), context },
      })
    }

    const succeed = () => {
      if (!bestFix) return
      finish({ ok: true, fix: bestFix, stage, elapsedMs: elapsedMs() })
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(abortError())
    }

    const announceStage = () => {
      try {
        onStageChange?.(stage)
      } catch {
        // Rendering progress must never break location acquisition.
      }
    }

    const considerPosition = (position: GeolocationPosition) => {
      if (settled) return
      const candidate = positionFix(position)
      if (!candidate.ok) {
        if (stage === 'quick') startHighAccuracy()
        else {
          highAccuracyFailure =
            candidate.rejection === 'too_coarse' ? 'position_unavailable' : 'request_error'
        }
        return
      }
      const fix = candidate.fix

      if (bestFix === null || fix.accuracyM < bestFix.accuracyM) bestFix = fix
      if (bestFix.accuracyM <= usefulAccuracyM) {
        succeed()
      } else if (stage === 'quick') {
        startHighAccuracy()
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      if (settled) return
      const reason = failureReason(error)
      if (reason === 'permission_denied') {
        fail(reason)
        return
      }
      if (stage === 'quick') {
        startHighAccuracy()
        return
      }
      if (reason === 'position_unavailable' || reason === 'timeout') {
        // WebKit can report these while a watch is still capable of yielding
        // a later fix. Keep listening until our explicit deadline.
        highAccuracyFailure = reason
        return
      }
      if (bestFix) succeed()
      else fail(reason)
    }

    function startHighAccuracy() {
      if (settled || stage === 'high_accuracy') return
      stage = 'high_accuracy'
      if (quickTimer !== null) clearTimeout(quickTimer)
      quickTimer = null
      announceStage()

      highAccuracyTimer = setTimeout(() => {
        if (bestFix) succeed()
        else fail(highAccuracyFailure ?? 'timeout')
      }, highAccuracyTimeoutMs)

      const options: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: highAccuracyTimeoutMs,
      }

      try {
        if (typeof geolocation.watchPosition === 'function') {
          const id = geolocation.watchPosition(considerPosition, handleError, options)
          watchId = id
          // A test double (or unusual implementation) can invoke a callback
          // synchronously before returning the id. Clear that newly returned
          // watch too if the callback already settled the request.
          if (settled && typeof geolocation.clearWatch === 'function') {
            geolocation.clearWatch(id)
            watchId = null
          }
        } else {
          // Some embedded webviews expose only getCurrentPosition.
          geolocation.getCurrentPosition(considerPosition, handleError, options)
        }
      } catch {
        if (bestFix) succeed()
        else fail('request_error')
      }
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    announceStage()

    quickTimer = setTimeout(startHighAccuracy, quickTimeoutMs)
    try {
      geolocation.getCurrentPosition(considerPosition, handleError, {
        enableHighAccuracy: false,
        maximumAge: QUICK_LOCATION_MAX_AGE_MS,
        timeout: quickTimeoutMs,
      })
    } catch {
      startHighAccuracy()
    }
  })
}
