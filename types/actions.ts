/**
 * Shared types for server actions
 */

export interface ActionResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

export interface ActionResultWithCount extends ActionResult {
  count?: number
}

export interface MergeResult extends ActionResult {
  updatedEventsCount?: number
  deletedRoutesCount?: number
}
