/**
 * Comparator module for comparing HTML and database data.
 *
 * Produces a list of discrepancies between the two data sources.
 */

import type { EventMatch, Discrepancy, ParsedEvent, DbEvent } from './types'
import { matchEvents, matchRiders, getUnmatchedDbResults, getUnmatchedDbEvents } from './matcher'

/**
 * Compare times for equality, handling format variations.
 * Returns true if times are considered equal.
 */
function timesMatch(htmlTime: string | null, dbTime: string | null): boolean {
  if (htmlTime === dbTime) return true
  if (!htmlTime && !dbTime) return true
  if (!htmlTime || !dbTime) return false

  // Normalize both times to H:MM format
  const normalizeTime = (t: string): string => {
    const match = t.match(/^(\d+):(\d{2})$/)
    if (match) {
      return `${parseInt(match[1])}:${match[2]}`
    }
    return t
  }

  return normalizeTime(htmlTime) === normalizeTime(dbTime)
}

/**
 * Compare status values.
 * Maps various status representations to comparable values.
 */
function statusesMatch(htmlStatus: 'finished' | 'dnf' | 'dns' | null, dbStatus: string): boolean {
  const normalizedDb = dbStatus.toLowerCase()

  if (htmlStatus === 'finished' && normalizedDb === 'finished') return true
  if (htmlStatus === 'dnf' && normalizedDb === 'dnf') return true
  if (htmlStatus === 'dns' && normalizedDb === 'dns') return true

  // If HTML has a time, treat as finished
  if (htmlStatus === null && normalizedDb === 'finished') return true

  return false
}

/**
 * Compare HTML events/results with database events/results.
 * Returns a list of EventMatch objects with discrepancies.
 */
export function compareData(htmlEvents: ParsedEvent[], dbEvents: DbEvent[]): EventMatch[] {
  const eventMatches = matchEvents(htmlEvents, dbEvents)
  const results: EventMatch[] = []

  // Process each HTML event
  for (const { htmlEvent, dbEvent, confidence } of eventMatches) {
    const discrepancies: Discrepancy[] = []

    if (!dbEvent) {
      // Event in HTML but not in DB
      discrepancies.push({
        type: 'event_missing_in_db',
        severity: 'error',
        description: `Event not found in database`,
        htmlValue: `${htmlEvent.name} on ${htmlEvent.date} (${htmlEvent.riders.length} riders)`,
      })

      results.push({
        htmlEvent,
        dbEvent: null,
        matchConfidence: 0,
        discrepancies,
      })
      continue
    }

    // Event matched - compare riders
    const riderMatches = matchRiders(htmlEvent.riders, dbEvent.results)

    for (const { htmlRider, dbResult, confidence: riderConfidence } of riderMatches) {
      if (!dbResult) {
        // Rider in HTML but not in DB
        discrepancies.push({
          type: 'missing_in_db',
          severity: 'error',
          description: `Rider not found in database`,
          htmlValue: `${htmlRider.name} - ${htmlRider.time || htmlRider.status || 'no time'}`,
          riderName: htmlRider.name,
        })
      } else {
        // Check for time mismatch
        if (!timesMatch(htmlRider.time, dbResult.time)) {
          discrepancies.push({
            type: 'time_mismatch',
            severity: 'warning',
            description: `Time mismatch`,
            htmlValue: htmlRider.time || 'no time',
            dbValue: dbResult.time || 'no time',
            riderName: htmlRider.name,
          })
        }

        // Check for status mismatch
        if (htmlRider.status && !statusesMatch(htmlRider.status, dbResult.status)) {
          discrepancies.push({
            type: 'status_mismatch',
            severity: 'warning',
            description: `Status mismatch`,
            htmlValue: htmlRider.status,
            dbValue: dbResult.status,
            riderName: htmlRider.name,
          })
        }

        // Note name variations
        if (riderConfidence < 1.0) {
          discrepancies.push({
            type: 'name_variation',
            severity: 'info',
            description: `Name variation (${Math.round(riderConfidence * 100)}% match)`,
            htmlValue: htmlRider.name,
            dbValue: `${dbResult.riderFirstName} ${dbResult.riderLastName}`,
            riderName: htmlRider.name,
          })
        }
      }
    }

    // Check for riders in DB but not in HTML
    const unmatchedDbResults = getUnmatchedDbResults(riderMatches, dbEvent.results)
    for (const dbResult of unmatchedDbResults) {
      discrepancies.push({
        type: 'missing_in_html',
        severity: 'warning',
        description: `Rider in DB but not found in HTML`,
        dbValue: `${dbResult.riderFirstName} ${dbResult.riderLastName} - ${dbResult.time || dbResult.status}`,
        riderName: `${dbResult.riderFirstName} ${dbResult.riderLastName}`,
      })
    }

    results.push({
      htmlEvent,
      dbEvent,
      matchConfidence: confidence,
      discrepancies,
    })
  }

  // Check for events in DB but not in HTML
  const unmatchedDbEvents = getUnmatchedDbEvents(eventMatches, dbEvents)
  for (const dbEvent of unmatchedDbEvents) {
    results.push({
      htmlEvent: {
        date: dbEvent.date,
        name: dbEvent.name,
        distance: dbEvent.distance,
        riders: [],
      },
      dbEvent,
      matchConfidence: 0,
      discrepancies: [
        {
          type: 'event_missing_in_html',
          severity: 'warning',
          description: `Event in DB but not found in HTML source`,
          dbValue: `${dbEvent.name} on ${dbEvent.date} (${dbEvent.results.length} results)`,
        },
      ],
    })
  }

  // Sort by date
  results.sort((a, b) => {
    const dateA = a.htmlEvent.date || a.dbEvent?.date || ''
    const dateB = b.htmlEvent.date || b.dbEvent?.date || ''
    return dateA.localeCompare(dateB)
  })

  return results
}
