/**
 * Suggest a correction for an email whose domain looks like a common typo.
 *
 * Soft, advisory only — used to render a "Did you mean …?" hint on the
 * registration forms. Returns the corrected full address (local-part + correct
 * domain, lowercased and trimmed) when the domain is a known typo, otherwise
 * null. Never throws.
 *
 * To cover a newly observed typo, add a `wrong: 'correct'` entry to
 * DOMAIN_TYPOS below.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  // gmail
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.colm': 'gmail.com',
  'googlemail.con': 'googlemail.com',
  // hotmail
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotnail.com': 'hotmail.com',
  // yahoo
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'ymail.con': 'ymail.com',
  // outlook / live / msn
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'live.con': 'live.com',
  'live.co': 'live.com',
  // icloud
  'icloud.co': 'icloud.com',
  'icloud.con': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  // canadian providers seen in registrations
  'rogers.con': 'rogers.com',
}

export function suggestEmailCorrection(email: string): string | null {
  const normalized = email.toLowerCase().trim()
  const atIndex = normalized.lastIndexOf('@')
  // Require a non-empty local-part and a domain after the last '@'.
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null
  }
  const localPart = normalized.slice(0, atIndex)
  const domain = normalized.slice(atIndex + 1)
  const correctedDomain = DOMAIN_TYPOS[domain]
  if (!correctedDomain) {
    return null
  }
  return `${localPart}@${correctedDomain}`
}
