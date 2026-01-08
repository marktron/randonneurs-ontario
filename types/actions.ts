/**
 * Shared types for server actions
 */

export interface ActionResult {
  success: boolean
  error?: string
}

export interface ActionResultWithCount extends ActionResult {
  count?: number
}

export interface MergeResult extends ActionResult {
  updatedEventsCount?: number
  deletedRoutesCount?: number
}
