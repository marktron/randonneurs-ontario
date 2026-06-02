/**
 * Current season resolution.
 *
 * The active competition/membership season is driven by the
 * NEXT_PUBLIC_CURRENT_SEASON env var so rolling the season is a single config
 * change rather than a code edit. NEXT_PUBLIC_ vars are inlined at build time,
 * so these helpers work in both server and client bundles.
 */

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
