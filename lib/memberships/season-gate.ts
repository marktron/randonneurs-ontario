import { getMembershipSeasonStatus } from '@/lib/ccn/client'
import { torontoCalendarYear } from '@/lib/season'

export function nextSeasonClosedMessage(season: number): string {
  return `Registration for ${season} events opens once ${season} memberships are available. Check back soon.`
}

/** null when registration may proceed; otherwise the message to show. */
export async function registrationSeasonBlock(season: number): Promise<string | null> {
  if (season <= torontoCalendarYear()) return null
  try {
    const status = await getMembershipSeasonStatus(season)
    if (status.status === 'open') return null
  } catch (error) {
    console.warn(`Season ${season} membership status lookup failed; blocking registration`, error)
  }
  return nextSeasonClosedMessage(season)
}
