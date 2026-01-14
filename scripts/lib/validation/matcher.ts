/**
 * Matcher module for comparing HTML and database data.
 *
 * Uses fuzzy matching for rider names and event matching by date/distance.
 */

import { findFuzzyNameMatches, levenshteinDistance } from '../../../lib/utils/fuzzy-match'
import type { ParsedEvent, DbEvent, ParsedRiderResult, DbResult } from './types'

// Match thresholds
const EVENT_NAME_MATCH_THRESHOLD = 0.6 // Name similarity (date & distance must match exactly)
const RIDER_MATCH_THRESHOLD = 0.85 // Rider name similarity

export interface EventMatchResult {
  htmlEvent: ParsedEvent
  dbEvent: DbEvent | null
  confidence: number
}

export interface RiderMatchResult {
  htmlRider: ParsedRiderResult
  dbResult: DbResult | null
  confidence: number
}

/**
 * Calculate similarity between two event names.
 */
function eventNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '')
  const n2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (n1 === n2) return 1.0
  if (n1.includes(n2) || n2.includes(n1)) return 0.9

  // Use Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length)
  if (maxLen === 0) return 1.0

  const distance = levenshteinDistance(n1, n2)
  return 1 - distance / maxLen
}

/**
 * Match events from HTML to database.
 * Events are matched by: exact date + distance within 10km + name similarity.
 */
export function matchEvents(htmlEvents: ParsedEvent[], dbEvents: DbEvent[]): EventMatchResult[] {
  const results: EventMatchResult[] = []
  const usedDbEventIds = new Set<string>()

  for (const htmlEvent of htmlEvents) {
    const match = findBestDbEventMatch(htmlEvent, dbEvents, usedDbEventIds)
    results.push({
      htmlEvent,
      dbEvent: match?.event || null,
      confidence: match?.score || 0,
    })
    if (match) {
      usedDbEventIds.add(match.event.id)
    }
  }

  return results
}

/**
 * Find the best matching database event for an HTML event.
 */
function findBestDbEventMatch(
  htmlEvent: ParsedEvent,
  dbEvents: DbEvent[],
  usedIds: Set<string>
): { event: DbEvent; score: number } | null {
  let bestMatch: { event: DbEvent; score: number } | null = null

  for (const dbEvent of dbEvents) {
    // Skip already matched events
    if (usedIds.has(dbEvent.id)) continue

    // Date must match exactly
    if (htmlEvent.date !== dbEvent.date) continue

    // Distance must be close (within 10km for rounding differences)
    if (Math.abs(htmlEvent.distance - dbEvent.distance) > 10) continue

    // Score based on name similarity
    const nameScore = eventNameSimilarity(htmlEvent.name, dbEvent.name)

    if (nameScore >= EVENT_NAME_MATCH_THRESHOLD) {
      if (!bestMatch || nameScore > bestMatch.score) {
        bestMatch = { event: dbEvent, score: nameScore }
      }
    }
  }

  return bestMatch
}

/**
 * Match riders from HTML to database results within a matched event.
 */
export function matchRiders(
  htmlRiders: ParsedRiderResult[],
  dbResults: DbResult[]
): RiderMatchResult[] {
  const results: RiderMatchResult[] = []
  const usedDbResultIds = new Set<string>()

  for (const htmlRider of htmlRiders) {
    // Find available DB results (not already matched)
    const availableResults = dbResults.filter((r) => !usedDbResultIds.has(r.riderId))

    // Use fuzzy matching to find the best match
    const matches = findFuzzyNameMatches(
      htmlRider.firstName,
      htmlRider.lastName,
      availableResults,
      (r) => r.riderFirstName,
      (r) => r.riderLastName,
      { threshold: RIDER_MATCH_THRESHOLD, maxResults: 1 }
    )

    if (matches.length > 0) {
      results.push({
        htmlRider,
        dbResult: matches[0].item,
        confidence: matches[0].score,
      })
      usedDbResultIds.add(matches[0].item.riderId)
    } else {
      results.push({
        htmlRider,
        dbResult: null,
        confidence: 0,
      })
    }
  }

  return results
}

/**
 * Get unmatched database results (in DB but not matched to HTML).
 */
export function getUnmatchedDbResults(
  riderMatches: RiderMatchResult[],
  dbResults: DbResult[]
): DbResult[] {
  const matchedRiderIds = new Set(
    riderMatches.filter((m) => m.dbResult).map((m) => m.dbResult!.riderId)
  )

  return dbResults.filter((r) => !matchedRiderIds.has(r.riderId))
}

/**
 * Get unmatched database events (in DB but not matched to HTML).
 */
export function getUnmatchedDbEvents(
  eventMatches: EventMatchResult[],
  dbEvents: DbEvent[]
): DbEvent[] {
  const matchedEventIds = new Set(eventMatches.filter((m) => m.dbEvent).map((m) => m.dbEvent!.id))

  return dbEvents.filter((e) => !matchedEventIds.has(e.id))
}
