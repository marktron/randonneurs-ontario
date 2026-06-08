/**
 * Suggest a correction for an email whose domain looks like a common typo.
 *
 * Soft, advisory only — used to render a "Did you mean …?" hint on the
 * registration forms. Returns the corrected full address (local-part + correct
 * domain, lowercased and trimmed) when the domain looks like a typo, otherwise
 * null. Never throws.
 *
 * Engine: fuzzy-match the typed domain against KNOWN_DOMAINS using edit
 * distance. If the domain is exactly one edit (substitution, insertion,
 * deletion, or adjacent transposition) from a SINGLE known-good domain, suggest
 * that domain. If two anchors tie at distance 1 (e.g. a `.co`/`.cm` typo that is
 * one edit from both the `.com` and the `.ca` variant), stay silent rather than
 * guess.
 *
 * DOMAIN_TYPOS is a manual override layer checked first, for the rare case we
 * want to pin a specific answer the engine cannot reach (e.g. a distance-≥2
 * typo). It is currently empty — the engine subsumes every typo we have seen.
 */

// Manual overrides: wrong-domain -> correct-domain. Checked before the engine.
// Currently empty; the edit-distance engine handles all observed typos. Add an
// entry here only to pin a specific distance-≥2 typo, e.g.:
//   'gmial.con': 'gmail.com',
const DOMAIN_TYPOS: Record<string, string> = {}

// Known-good destination domains, derived from the most common domains in the
// riders table (Ontario population → several Canadian providers). The engine
// only ever suggests a domain from this list, so additions here are how the
// guard learns new providers. Keep to genuinely popular targets to avoid
// nudging legitimate rare domains.
const KNOWN_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.ca',
  'hotmail.com',
  'hotmail.ca',
  'outlook.com',
  'live.com',
  'live.ca',
  'icloud.com',
  'me.com',
  'mac.com',
  'ymail.com',
  'aol.com',
  'msn.com',
  'rogers.com',
  'sympatico.ca',
  'bell.net',
]

/**
 * Optimal String Alignment distance (restricted Damerau-Levenshtein): counts
 * single-character insertions, deletions, substitutions, and adjacent
 * transpositions, each as cost 1.
 */
function osaDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1) // adjacent transposition
      }
    }
  }
  return d[m][n]
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

  // 1. Manual override map wins.
  const override = DOMAIN_TYPOS[domain]
  if (override) {
    return `${localPart}@${override}`
  }

  // 2. Already a known-good domain — nothing to suggest.
  if (KNOWN_DOMAINS.includes(domain)) {
    return null
  }

  // 3. Fuzzy fallback: the unique nearest anchor at edit distance exactly 1.
  let best: string | null = null
  let bestDistance = Infinity
  let tied = false
  for (const candidate of KNOWN_DOMAINS) {
    const dist = osaDistance(domain, candidate)
    if (dist < bestDistance) {
      bestDistance = dist
      best = candidate
      tied = false
    } else if (dist === bestDistance) {
      tied = true
    }
  }

  if (bestDistance === 1 && best && !tied) {
    return `${localPart}@${best}`
  }
  return null
}
