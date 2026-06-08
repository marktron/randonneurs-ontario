# Email typo-guard edit-distance generalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `suggestEmailCorrection` catch single-character domain typos (e.g. `yahoo.comc`) by fuzzy-matching against a known-good anchor list, instead of only matching an exact hand-maintained typo map.

**Architecture:** Inside `lib/utils/email-typo.ts`, keep the normalize/split preamble and the (now-empty) `DOMAIN_TYPOS` override map checked first, then add: (a) an `OSA` (Optimal String Alignment / restricted Damerau-Levenshtein) distance helper, (b) a `KNOWN_DOMAINS` anchor list derived from real rider data, (c) decision logic that suggests the unique nearest anchor at edit distance exactly 1, and returns `null` on a tie or when the domain already equals an anchor. The component, form wiring, and function signature are unchanged.

**Tech Stack:** TypeScript, Vitest (unit tests), Next.js (consuming component unchanged).

---

### Task 1: Replace the engine in `email-typo.ts` (TDD)

**Files:**

- Modify: `lib/utils/email-typo.ts`
- Test: `tests/unit/lib/email-typo.test.ts`

- [ ] **Step 1: Add failing tests for the new engine**

Append a new `describe` block to `tests/unit/lib/email-typo.test.ts` (keep the existing `describe('suggestEmailCorrection', ...)` block as-is — those cases must still pass):

```ts
describe('suggestEmailCorrection — edit-distance engine', () => {
  it('suggests on clear distance-1 typos (extra/dropped/wrong/transposed char)', () => {
    expect(suggestEmailCorrection('colin@yahoo.comc')).toBe('colin@yahoo.com') // extra char
    expect(suggestEmailCorrection('r@gmail.con')).toBe('r@gmail.com') // wrong char
    expect(suggestEmailCorrection('r@gmail.cm')).toBe('r@gmail.com') // dropped char
    expect(suggestEmailCorrection('r@gmaill.com')).toBe('r@gmail.com') // extra char
    expect(suggestEmailCorrection('r@gamil.com')).toBe('r@gmail.com') // transposition
    expect(suggestEmailCorrection('r@rogers.con')).toBe('r@rogers.com')
    expect(suggestEmailCorrection('r@outlok.com')).toBe('r@outlook.com')
  })

  it('suggests gmail.com for gmail.co (unambiguous — no gmail.ca anchor)', () => {
    expect(suggestEmailCorrection('r@gmail.co')).toBe('r@gmail.com')
  })

  it('stays silent on .com/.ca ties (ambiguous → null)', () => {
    expect(suggestEmailCorrection('r@yahoo.co')).toBeNull() // yahoo.com vs yahoo.ca
    expect(suggestEmailCorrection('r@yahoo.cm')).toBeNull()
    expect(suggestEmailCorrection('r@hotmail.co')).toBeNull()
    expect(suggestEmailCorrection('r@live.cm')).toBeNull()
  })

  it('returns null when the domain already equals a known anchor', () => {
    expect(suggestEmailCorrection('r@gmail.com')).toBeNull()
    expect(suggestEmailCorrection('r@yahoo.ca')).toBeNull()
    expect(suggestEmailCorrection('r@bell.net')).toBeNull()
  })

  it('returns null for unrelated valid domains and distance-≥2 noise', () => {
    expect(suggestEmailCorrection('vp@randonneursontario.ca')).toBeNull()
    expect(suggestEmailCorrection('first.last@domain.co.uk')).toBeNull()
    expect(suggestEmailCorrection('r@example.org')).toBeNull()
    expect(suggestEmailCorrection('r@gmial.con')).toBeNull() // 2 edits from gmail.com
  })

  it('documents the accepted short-anchor nudge', () => {
    expect(suggestEmailCorrection('r@we.com')).toBe('r@me.com')
  })
})
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run tests/unit/lib/email-typo.test.ts`
Expected: the new `edit-distance engine` block FAILS — the current map-only impl returns `null` for `yahoo.comc` and `we.com` (not in the map), so those assertions fail. The original `describe` block still PASSES against the old impl (its cases are all exact map keys today); after Step 3 it must remain green via the engine. So the failure is confined to the new block.

- [ ] **Step 3: Rewrite `lib/utils/email-typo.ts` with the engine**

Replace the entire file contents with:

```ts
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
```

- [ ] **Step 4: Run the email-typo tests and confirm all pass**

Run: `npx vitest run tests/unit/lib/email-typo.test.ts`
Expected: PASS — both the original block and the new `edit-distance engine` block.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/email-typo.ts tests/unit/lib/email-typo.test.ts
git commit -m "Generalize email typo-guard with edit-distance matching"
```

---

### Task 2: Update feature docs

**Files:**

- Modify: `docs/email-typo-guard.md`

- [ ] **Step 1: Rewrite the "How it works" and "Extending" sections**

In `docs/email-typo-guard.md`, replace the description of the curated-map mechanism with the engine. The new text must convey:

- `suggestEmailCorrection` fuzzy-matches the domain against a `KNOWN_DOMAINS`
  anchor list using edit distance (OSA / restricted Damerau-Levenshtein), and
  suggests the unique nearest anchor at distance exactly 1.
- It returns `null` when the domain already equals an anchor, when no anchor is
  within one edit, or when two anchors tie at distance 1 (e.g. `yahoo.co` is one
  edit from both `yahoo.com` and `yahoo.ca`, so it stays silent). `gmail.co`
  still suggests `gmail.com` because there is no `gmail.ca` anchor.
- `DOMAIN_TYPOS` is now an (empty) manual-override layer for pinning a specific
  distance-≥2 typo the engine can't reach.
- The anchor list is derived from the most common domains in the `riders` table.
- **Extending:** add a domain to `KNOWN_DOMAINS` to teach the guard a new
  provider (preferred); use a `DOMAIN_TYPOS` entry only to pin a specific
  override. Add a matching assertion in `tests/unit/lib/email-typo.test.ts`.
- Keep the existing `.co` note, and add the accepted short-anchor tradeoff
  (`me.com`/`mac.com`: a one-char change is a large fraction of the string, so
  e.g. `we.com` is nudged toward `me.com`; acceptable because the hint is soft
  and no real rider domain collides).

- [ ] **Step 2: Commit**

```bash
git add docs/email-typo-guard.md
git commit -m "Update typo-guard docs for edit-distance engine"
```

---

### Task 3: Validate against real data (zero false positives), then clean up

**Files:**

- Temp (create then delete): `scripts/_tmp-domain-distribution.ts`
- Reuse: `scripts/load-env.ts`

- [ ] **Step 1: Write a read-only validation script**

Create `scripts/_tmp-domain-distribution.ts`:

```ts
import './load-env'
import WebSocket from 'ws'
import { createClient } from '@supabase/supabase-js'
import { suggestEmailCorrection } from '../lib/utils/email-typo'

if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  ;(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing supabase env')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const domains = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('riders')
      .select('email')
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const r of data) {
      const email = (r.email || '').toLowerCase().trim()
      const at = email.lastIndexOf('@')
      if (at <= 0 || at === email.length - 1) continue
      domains.add(email.slice(at + 1))
    }
    if (data.length < pageSize) break
  }

  const flagged: string[] = []
  for (const domain of domains) {
    const suggestion = suggestEmailCorrection(`probe@${domain}`)
    if (suggestion) flagged.push(`${domain} -> ${suggestion}`)
  }

  console.log(`Distinct real domains checked: ${domains.size}`)
  if (flagged.length === 0) {
    console.log('Zero false positives: no real rider domain produced a suggestion.')
  } else {
    console.log('FALSE POSITIVES (real domains that got a suggestion):')
    for (const f of flagged) console.log(`  ${f}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against production (read-only)**

Run: `npx tsx scripts/_tmp-domain-distribution.ts --env-file=.env.production.local`
Expected: `Zero false positives: no real rider domain produced a suggestion.`
If any domain is flagged, STOP and report — the anchor list or threshold needs revisiting before completion.

- [ ] **Step 3: Delete the temp script**

Run: `rm scripts/_tmp-domain-distribution.ts`
Confirm it is gone (it must not be committed): `git status --porcelain scripts/`

---

### Task 4: Final verification

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all pass (includes the email-typo unit tests and the unchanged
registration-form component/wiring tests).

---

## Notes for the executor

- Do NOT touch `components/email-typo-suggestion.tsx` or the three registration
  forms — the UX and the `suggestEmailCorrection` signature are unchanged, so
  the existing component/wiring tests must keep passing untouched.
- The screenshot requirement does not apply: no UI changed. Say so in the
  completion summary.
- `scripts/_tmp-domain-distribution.ts` is a throwaway validation tool; it must
  not survive into a commit.
