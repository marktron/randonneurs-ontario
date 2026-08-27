/**
 * Privacy-conscious diagnostics for a failed brevet-card location request.
 *
 * These values cross the client/server boundary and are stored with manual
 * check-ins, so keep them bounded and free of raw user-agent or browser error
 * strings.
 */

export const LOCATION_FAILURE_REASONS = [
  'insecure_context',
  'unsupported',
  'permission_denied',
  'position_unavailable',
  'timeout',
  'request_error',
] as const

export type LocationFailureReason = (typeof LOCATION_FAILURE_REASONS)[number]

export const LOCATION_FAILURE_STAGES = ['preflight', 'quick', 'high_accuracy'] as const

export type LocationFailureStage = (typeof LOCATION_FAILURE_STAGES)[number]

export const LOCATION_CONTEXTS = ['browser', 'standalone', 'embedded'] as const

export type LocationContext = (typeof LOCATION_CONTEXTS)[number]

/** Bound client timing input before it is persisted. */
export const MAX_LOCATION_FAILURE_ELAPSED_MS = 2 * 60 * 1000

export interface LocationFailureDiagnostic {
  reason: LocationFailureReason
  stage: LocationFailureStage
  elapsedMs: number
  context: LocationContext
}

export function isLocationFailureReason(value: unknown): value is LocationFailureReason {
  return LOCATION_FAILURE_REASONS.includes(value as LocationFailureReason)
}

export function isLocationFailureStage(value: unknown): value is LocationFailureStage {
  return LOCATION_FAILURE_STAGES.includes(value as LocationFailureStage)
}

export function isLocationContext(value: unknown): value is LocationContext {
  return LOCATION_CONTEXTS.includes(value as LocationContext)
}
