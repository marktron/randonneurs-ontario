/**
 * Type definitions for the HTML vs Database validation tool.
 */

// ============================================================================
// Parsed from HTML via OpenAI
// ============================================================================

export interface ParsedRiderResult {
  name: string // Full name as appears in HTML
  firstName: string // Extracted first name
  lastName: string // Extracted last name
  time: string | null // "10:30" format or null for DNF/DNS
  status: 'finished' | 'dnf' | 'dns' | null
}

export interface ParsedEvent {
  date: string // "2025-04-15" format
  name: string // Route/event name
  distance: number // km
  riders: ParsedRiderResult[]
}

// ============================================================================
// From Supabase database
// ============================================================================

export interface DbResult {
  riderId: string
  riderFirstName: string
  riderLastName: string
  time: string | null // PostgreSQL interval as string
  status: string
}

export interface DbEvent {
  id: string
  date: string
  name: string
  distance: number
  results: DbResult[]
}

// ============================================================================
// Comparison results
// ============================================================================

export type DiscrepancyType =
  | 'missing_in_db'
  | 'missing_in_html'
  | 'time_mismatch'
  | 'status_mismatch'
  | 'name_variation'
  | 'event_missing_in_db'
  | 'event_missing_in_html'

export type Severity = 'error' | 'warning' | 'info'

export interface Discrepancy {
  type: DiscrepancyType
  severity: Severity
  description: string
  htmlValue?: string
  dbValue?: string
  riderName?: string
}

export interface EventMatch {
  htmlEvent: ParsedEvent
  dbEvent: DbEvent | null
  matchConfidence: number
  discrepancies: Discrepancy[]
}

export interface ValidationSummary {
  eventsInHtml: number
  eventsInDb: number
  eventsMatched: number
  ridersValidated: number
  errorsFound: number
  warningsFound: number
  infosFound: number
}

export interface ValidationReport {
  chapter: string
  year: number
  url: string
  fetchedAt: string
  fromCache: boolean
  summary: ValidationSummary
  events: EventMatch[]
}

// ============================================================================
// Chapter configuration
// ============================================================================

export interface ChapterUrlConfig {
  code: string // e.g., 'tor' for Toronto
  startYear: number // Earliest year with results
  endYear?: number // Latest year (if chapter no longer active)
}

export const CHAPTER_URL_CONFIGS: Record<string, ChapterUrlConfig> = {
  toronto: { code: 'tor', startYear: 1997 },
  ottawa: { code: 'ott', startYear: 1999 },
  simcoe: { code: 'sim', startYear: 2001 },
  huron: { code: 'hur', startYear: 2004 },
  permanent: { code: 'perm', startYear: 2013 },
  niagara: { code: 'niag', startYear: 2005, endYear: 2006 },
}
