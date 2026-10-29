/**
 * Season helpers.
 *
 * getCurrentSeason / getCurrentSeasonLabel read NEXT_PUBLIC_CURRENT_SEASON and
 * are display-only: they pick which season admin filters, records and reports
 * default to, so rolling the season is a config change rather than a code
 * edit. NEXT_PUBLIC_ vars are inlined at build time, so they work in both
 * server and client bundles.
 *
 * seasonOfEventDate and torontoCalendarYear do not read the env var. Membership
 * verification and the next-season registration gate use them.
 */

import { TORONTO_TZ } from '@/lib/brmTimes'

const FALLBACK_SEASON = 2026

/** Current season as a number, e.g. 2026. */
export function getCurrentSeason(): number {
  const parsed = parseInt(process.env.NEXT_PUBLIC_CURRENT_SEASON ?? '', 10)
  return Number.isNaN(parsed) ? FALLBACK_SEASON : parsed
}

/** Current season as a string, e.g. "2026". */
export function getCurrentSeasonLabel(): string {
  return String(getCurrentSeason())
}

/** Season (calendar year) an event belongs to, from its YYYY-MM-DD date. */
export function seasonOfEventDate(eventDate: string): number {
  return Number(eventDate.slice(0, 4))
}

/** Today's calendar year in Toronto. */
export function torontoCalendarYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TZ,
    year: 'numeric',
  }).format(now)
  return Number(year)
}
