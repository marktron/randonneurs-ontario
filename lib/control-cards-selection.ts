/** Parse a comma-separated `riderIds` query param into a Set, or null when empty. */
function parseRiderIds(param: string | undefined): Set<string> | null {
  if (!param) return null
  const ids = param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

/**
 * Filter registrations to a selected set of rider IDs.
 *
 * When `riderIdsParam` is undefined/empty/whitespace, every registration is
 * returned EXCEPT riders who chose a digital brevet card (the "print for
 * everyone" default skips cards nobody will use) — missing/null
 * `brevet_card_type` is treated as paper and kept. Otherwise only
 * registrations whose `riders.id` is in the set are returned, in their
 * original order, honoured exactly (a digital rider named explicitly still
 * prints); unknown IDs and `riders === null` rows are dropped.
 */
export function selectRegistrations<
  T extends { riders: { id: string } | null; brevet_card_type?: string | null },
>(registrations: T[], riderIdsParam: string | undefined): T[] {
  const ids = parseRiderIds(riderIdsParam)
  if (!ids) return registrations.filter((r) => r.brevet_card_type !== 'digital')
  return registrations.filter((r) => r.riders !== null && ids.has(r.riders.id))
}
