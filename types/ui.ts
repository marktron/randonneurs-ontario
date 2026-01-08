/**
 * Common UI types used across components
 * These are display-oriented types, distinct from database row types in supabase.ts
 */

/**
 * Minimal chapter info for dropdowns and selectors
 */
export interface ChapterOption {
  id: string
  name: string
}

/**
 * Chapter option with slug for routing
 */
export interface ChapterOptionWithSlug extends ChapterOption {
  slug: string
}

/**
 * Minimal route info for display
 */
export interface RouteOption {
  id: string
  name: string
  slug: string
  chapter_id: string | null
  distance_km: number | null
  collection: string | null
  description: string | null
  rwgps_id: string | null
  cue_sheet_url: string | null
  notes: string | null
  is_active: boolean
}

/**
 * Route with joined chapter data
 */
export interface RouteWithChapter extends RouteOption {
  chapters: { id: string; name: string } | null
}

/**
 * Event with joined chapter data for admin listing
 */
export interface EventWithChapter {
  id: string
  name: string
  event_date: string
  distance_km: number
  event_type: string
  status: string
  chapters: { name: string } | null
}
