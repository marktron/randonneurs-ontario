# Email typo-guard: edit-distance generalization

**Date:** 2026-06-07
**Status:** Approved
**Supersedes (extends):** `2026-06-03-email-typo-guard-design.md`

## Problem

The typo-guard (`lib/utils/email-typo.ts`) currently detects mistyped email
domains with a hand-maintained `DOMAIN_TYPOS` map (`wrong → correct`). It only
fires when the typed domain is an _exact_ key in that map.

A new bad submission, `colin_adeyemi@yahoo.comc`, slipped through: `yahoo.comc`
is `yahoo.com` with one extra trailing character, but that exact string was not
in the map. Adding it would be whack-a-mole — the next rider will type
`yahoo.cmo`, `gmail.comm`, `gmial.con`, etc.

Notably, nearly every existing map entry (`gmai.com`, `gmial.com`, `gnail.com`,
`gmail.colm`, `icould.com`, …) is just **one edit** away from its correct form.
The map is a hand-enumeration of distance-1 typos. The generalization is to
compute edit distance to a list of known-good domains instead of enumerating
every misspelling.

## Goal

Generalize `suggestEmailCorrection` to catch the long tail of single-character
domain typos (wrong/dropped/extra char, adjacent transposition) without adding a
map row per misspelling — while keeping the false-positive rate effectively zero
and the existing soft, non-blocking UX unchanged.

Out of scope: the `<EmailTypoSuggestion>` component, the on-blur wiring in the
three rider forms, server-side `validateEmail()`. Only the internals of
`suggestEmailCorrection` change; its signature is unchanged.

## Data basis

Aggregated the `riders` table (production, 651 riders with a parseable email,
104 distinct domains) to ground both the anchor list and the false-positive
assessment:

- Popular domains (typo targets): `gmail.com` (385), `hotmail.com` (45),
  `rogers.com` (28), `yahoo.com` (22), `yahoo.ca` (18), `sympatico.ca` (11),
  `icloud.com` (9), `outlook.com` (9), `me.com` (8), `mac.com` (7),
  `live.ca` (4), `bell.net` (3), `hotmail.ca` (3).
- The ~90 long-tail domains are all legitimate (personal, corporate,
  universities, `protonmail.com`, `duck.com`, `gmx.com`, `aol.com`, …).
- **No real domain sits within one edit of a popular anchor** (other than the
  anchor itself), and there are no leftover typos in the data. So a
  distance-≤1 rule fires essentially no false positives on this population.

## Design

`suggestEmailCorrection(email)` keeps its signature (`string → string | null`)
and its normalize/split-on-last-`@` preamble. New decision order:

1. **Exact map first.** If `domain` is a key in `DOMAIN_TYPOS`, return that
   correction. Pinned overrides always win.
2. **Already correct.** If `domain` exactly equals a known-good anchor, return
   `null`.
3. **Fuzzy fallback.** Compute Optimal String Alignment (Damerau-Levenshtein
   restricted, adjacent transposition = 1) distance from `domain` to each
   anchor; take the minimum.
   - min distance `=== 1` and achieved by **exactly one** anchor → suggest
     `localPart@<anchor>`.
   - two or more anchors tie at distance 1 → return `null` (do not guess).
   - otherwise → `null`.

The suggested address reuses the (lowercased) local-part, matching current
behavior.

### Anchor list

Popular targets only — these are what riders typo _toward_:

```
gmail.com, googlemail.com, yahoo.com, yahoo.ca, hotmail.com, hotmail.ca,
outlook.com, live.com, live.ca, icloud.com, me.com, mac.com, ymail.com,
aol.com, msn.com, rogers.com, sympatico.ca, bell.net
```

### Curated map: trimmed to an extension point

The map stays as an explicit overrides layer (job: pin a specific answer for a
distance-≥2 typo we observe in the wild that the engine can't reach, and
document intent). Working through the current anchor list, **every** prior map
entry is either:

- subsumed by the engine (a clear distance-1 typo, e.g. `gmail.con`,
  `gmial.com`, `yahoo.comc`), or
- correctly resolved to a **silent tie** (`yahoo.co`/`yahoo.cm`,
  `hotmail.co`, `live.co`/`live.cm` are each distance 1 from both the `.com`
  and the `.ca` anchor → ambiguous → `null`).

So the map is trimmed to **empty** for now — kept (with an explanatory comment
and a commented-out example showing the format) as a documented extension point.
The file then reads as "engine = edit distance; map = manual overrides, none
currently needed."

Note the asymmetry, which is intended: `gmail.co` still suggests `gmail.com`
because there is no `gmail.ca` anchor, so it is unambiguous. The `.com`/`.ca`
providers stay silent on their `.co`/`.cm` typos rather than guess.

### Accepted risks (consistent with the existing `.co` stance)

- **Short anchors** (`me.com`, `mac.com`): a one-char edit is a large fraction
  of the string, so e.g. `we.com` would be nudged toward `me.com`. Accepted —
  the hint is soft/ignorable and zero such collisions exist in 651 real riders.
  (Per decision, short anchors are NOT excluded from fuzzy matching.)
- **`.co` ccTLD**: `gmail.co` (distance 1) → suggests `gmail.com`. Same accepted
  tradeoff as today; a rare legitimate `.co` user ignores the hint.

## Validation

Before completion, re-run the anchor list against all real rider domains (temp
script against production, read-only) and confirm **zero false positives**
(no real domain other than an anchor produces a suggestion). Delete the temp
script afterward.

## Testing

- Unit (`tests/unit/lib/email-typo.test.ts`):
  - suggests on clear distance-1 typos: `yahoo.comc → yahoo.com`,
    `gmail.con → gmail.com`, `gmail.cm → gmail.com`, `rogers.con → rogers.com`,
    plus dropped/extra/transposed-char variants and `gmail.co → gmail.com`
    (unambiguous, no `gmail.ca` anchor).
  - returns `null` on the `.com`/`.ca` ties: `yahoo.co`, `yahoo.cm`,
    `live.cm`, `hotmail.co` (ambiguous → stay silent).
  - returns `null` when the domain already equals an anchor (`gmail.com`,
    `yahoo.ca`).
  - returns `null` for unrelated valid domains (`randonneursontario.ca`,
    `domain.co.uk`) and for distance-≥2 noise.
  - documents the accepted short-anchor nudge: `we.com → me.com`.
  - existing assertions for the still-valid cases stay green.
- Component/wiring tests in `tests/unit/components/registration-form.test.tsx`
  remain valid (UX unchanged) — no new test needed, but confirm they pass.

## Docs

Update `docs/email-typo-guard.md`: describe the edit-distance engine, the anchor
list and how to extend it (add an anchor, not a map row), the trimmed role of
the map, and the accepted short-anchor / `.co` tradeoffs.
