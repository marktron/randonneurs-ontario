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
 * returned unchanged (the "print for everyone" default). Otherwise only
 * registrations whose `riders.id` is in the set are returned, in their original
 * order; unknown IDs and `riders === null` rows are dropped.
 */
export function selectRegistrations<T extends { riders: { id: string } | null }>(
  registrations: T[],
  riderIdsParam: string | undefined
): T[] {
  const ids = parseRiderIds(riderIdsParam)
  if (!ids) return registrations
  return registrations.filter((r) => r.riders !== null && ids.has(r.riders.id))
}
