/**
 * ACP season helpers.
 *
 * Audax Club Parisien runs its season from Nov 1 to Oct 31, labelled by the
 * year it ends in: Nov 1, 2026 to Oct 31, 2027 is the 2027 season. This is
 * separate from `events.season`, which is the plain calendar year of the
 * event date. Only the bulk publish of draft events uses the ACP window.
 */

/** ACP season for a calendar year and 1-based month: Nov and Dec roll forward. */
export function acpSeasonOfParts(year: number, month: number): number {
  return month >= 11 ? year + 1 : year
}

/** ACP season of a YYYY-MM-DD date: Nov and Dec roll forward into the next year. */
export function acpSeasonOf(eventDate: string): number {
  return acpSeasonOfParts(Number(eventDate.slice(0, 4)), Number(eventDate.slice(5, 7)))
}

/** Inclusive date bounds (YYYY-MM-DD) of an ACP season. */
export function acpSeasonWindow(acpSeason: number): { start: string; end: string } {
  return { start: `${acpSeason - 1}-11-01`, end: `${acpSeason}-10-31` }
}
