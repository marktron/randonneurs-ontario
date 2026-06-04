# Email Typo-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch common email-domain typos (e.g. `gmail.co`) on the rider registration forms and offer a one-click correction, without ever blocking submission.

**Architecture:** A pure lookup function maps known-bad domains to their correct form. A thin client component renders a "Did you mean …? Use this" hint on blur and writes the correction back into the form's existing email state. Wired into the three rider-facing forms.

**Tech Stack:** TypeScript, Next.js (App Router), React client components, Tailwind, Vitest.

---

## Task 1: `suggestEmailCorrection` utility

**Files:**

- Create: `lib/utils/email-typo.ts`
- Test: `tests/unit/lib/email-typo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { suggestEmailCorrection } from '@/lib/utils/email-typo'

describe('suggestEmailCorrection', () => {
  it('corrects a known typo domain', () => {
    expect(suggestEmailCorrection('haemdoc2@gmail.co')).toBe('haemdoc2@gmail.com')
    expect(suggestEmailCorrection('rider@gmial.com')).toBe('rider@gmail.com')
    expect(suggestEmailCorrection('rider@gmail.con')).toBe('rider@gmail.com')
    expect(suggestEmailCorrection('rider@hotmial.com')).toBe('rider@hotmail.com')
    expect(suggestEmailCorrection('rider@yahooo.com')).toBe('rider@yahoo.com')
  })

  it('returns null for valid domains', () => {
    expect(suggestEmailCorrection('rider@gmail.com')).toBeNull()
    expect(suggestEmailCorrection('vp-simcoe@randonneursontario.ca')).toBeNull()
    expect(suggestEmailCorrection('first.last@domain.co.uk')).toBeNull()
  })

  it('is case-insensitive and normalizes the suggestion', () => {
    expect(suggestEmailCorrection('Foo@GMAIL.CO')).toBe('foo@gmail.com')
  })

  it('preserves the local-part exactly (lowercased), including dots and plus tags', () => {
    expect(suggestEmailCorrection('first.last+rando@gmail.co')).toBe('first.last+rando@gmail.com')
  })

  it('returns null for malformed or empty input without throwing', () => {
    expect(suggestEmailCorrection('')).toBeNull()
    expect(suggestEmailCorrection('   ')).toBeNull()
    expect(suggestEmailCorrection('no-at-sign')).toBeNull()
    expect(suggestEmailCorrection('trailing@')).toBeNull()
    expect(suggestEmailCorrection('@leading.com')).toBeNull()
    // split on the LAST '@' → local-part 'a@b', domain 'gmail.co'
    expect(suggestEmailCorrection('a@b@gmail.co')).toBe('a@b@gmail.com')
  })
})
```

Note on the last assertion: the address is split on the **last** `@`, so
`a@b@gmail.co` has local-part `a@b` and domain `gmail.co`, correcting to
`a@b@gmail.com`. This documents the last-`@` split behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/email-typo.test.ts`
Expected: FAIL — `suggestEmailCorrection` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
  'sympatico.ca.': 'sympatico.ca',
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/email-typo.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/email-typo.ts tests/unit/lib/email-typo.test.ts
git commit -m "Add suggestEmailCorrection typo-guard utility"
```

---

## Task 2: `EmailTypoSuggestion` component

**Files:**

- Create: `components/email-typo-suggestion.tsx`

This component is presentation-only over the Task 1 util; coverage comes from
the util tests. The parent controls _when_ it can suggest by passing the current
email value (forms pass it only after blur — see Task 3 — so there is no
flicker while typing).

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { suggestEmailCorrection } from '@/lib/utils/email-typo'

interface EmailTypoSuggestionProps {
  /** The email value to check (parent passes the blurred value). */
  email: string
  /** Called with the corrected address when the rider accepts the suggestion. */
  onAccept: (corrected: string) => void
}

export function EmailTypoSuggestion({ email, onAccept }: EmailTypoSuggestionProps) {
  const suggestion = suggestEmailCorrection(email)
  if (!suggestion) {
    return null
  }
  return (
    <p className="text-sm text-muted-foreground" role="status">
      Did you mean{' '}
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        className="text-primary font-medium hover:underline underline-offset-2"
      >
        {suggestion}
      </button>
      ?
    </p>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/email-typo-suggestion.tsx
git commit -m "Add EmailTypoSuggestion component"
```

---

## Task 3: Wire into the three rider forms

The component should evaluate the email only after the rider leaves the field,
to avoid suggesting mid-type. Each form already has `const [email, setEmail] =
useState('')`. Add a sibling `blurredEmail` state, set it on the input's
`onBlur`, clear it on `onChange` (so a stale suggestion disappears while
editing), and render `<EmailTypoSuggestion>` against `blurredEmail`.

**Files:**

- Modify: `components/registration-form.tsx`
- Modify: `components/fleche-registration-form.tsx`
- Modify: `components/permanent-registration-form.tsx`

- [ ] **Step 1: registration-form.tsx — import**

Add to the existing component imports near the top of the file:

```tsx
import { EmailTypoSuggestion } from '@/components/email-typo-suggestion'
```

- [ ] **Step 2: registration-form.tsx — add blurredEmail state**

Beside the existing `const [email, setEmail] = useState('')`:

```tsx
const [blurredEmail, setBlurredEmail] = useState('')
```

- [ ] **Step 3: registration-form.tsx — update the email Input and render the hint**

Replace the email field block (currently around lines 370–385):

```tsx
{
  /* Email */
}
;<div className="space-y-2">
  <Label htmlFor="email">Email address</Label>
  <Input
    id="email"
    name="email"
    type="email"
    inputMode="email"
    placeholder="you@example.com"
    required
    autoComplete="email"
    disabled={isPending}
    value={email}
    onChange={(e) => {
      setEmail(e.target.value)
      setBlurredEmail('')
    }}
    onBlur={(e) => setBlurredEmail(e.target.value)}
  />
  <EmailTypoSuggestion
    email={blurredEmail}
    onAccept={(corrected) => {
      setEmail(corrected)
      setBlurredEmail('')
    }}
  />
</div>
```

- [ ] **Step 4: fleche-registration-form.tsx — apply the same three edits**

Add the import (Step 1), add `const [blurredEmail, setBlurredEmail] = useState('')`
beside its `const [email, setEmail] = useState('')` (line ~83), then update the
email `<Input>` (lines ~436–445) to add the `onChange` reset + `onBlur` exactly
as in Step 3, and render `<EmailTypoSuggestion>` immediately after the `<Input>`
inside the same field wrapper:

```tsx
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setBlurredEmail('')
            }}
            onBlur={(e) => setBlurredEmail(e.target.value)}
          />
          <EmailTypoSuggestion
            email={blurredEmail}
            onAccept={(corrected) => {
              setEmail(corrected)
              setBlurredEmail('')
            }}
          />
```

(Preserve this form's existing surrounding markup/indentation and any other
existing props on the `<Input>`; only add `onChange` reset, `onBlur`, and the
suggestion element.)

- [ ] **Step 5: permanent-registration-form.tsx — apply the same three edits**

Same as Step 4, against its `const [email, setEmail] = useState('')` (line
~109) and its email `<Input>` (lines ~524–533). Add the import, the
`blurredEmail` state, the `onChange` reset + `onBlur`, and the
`<EmailTypoSuggestion>` element right after the `<Input>`.

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (no behavioral test regressions).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Visual verification (Playwright screenshot)**

If the dev server is not already at `http://localhost:3000/`, start it. Open a
registration page with an open event, type `someone@gmail.co` into the email
field, tab/click away, and confirm the "Did you mean someone@gmail.com?" hint
renders below the field. Click it and confirm the field updates and the hint
disappears. Capture a screenshot of the hint state.

(Per `docs/style_guide.md` for any visual polish.)

- [ ] **Step 9: Commit**

```bash
git add components/registration-form.tsx components/fleche-registration-form.tsx components/permanent-registration-form.tsx
git commit -m "Wire email typo-guard into rider registration forms"
```

---

## Task 4: Documentation

**Files:**

- Create: `docs/email-typo-guard.md`

- [ ] **Step 1: Write the doc**

```markdown
# Email typo-guard

Riders sometimes mistype their email domain (e.g. `gmail.co` instead of
`gmail.com`). Such addresses pass basic validation but the confirmation email
fails to deliver at SES and hard-bounces, leaving the rider with no
confirmation.

## How it works

- `lib/utils/email-typo.ts` exports `suggestEmailCorrection(email)`, a pure
  function that maps a known-bad domain to its correct form using the curated
  `DOMAIN_TYPOS` map. It returns the corrected full address, or `null` when the
  domain is not a known typo.
- `components/email-typo-suggestion.tsx` renders a soft, non-blocking
  "Did you mean …? " hint with a one-click correction.
- The hint is wired into the three rider-facing registration forms
  (`registration-form`, `fleche-registration-form`,
  `permanent-registration-form`) and appears **on blur** (after the rider leaves
  the email field).

The guard never blocks submission — it only suggests. Server-side
`validateEmail()` remains the backstop for genuinely malformed input.

## Extending the list

Add a `'wrong-domain': 'correct-domain'` entry to `DOMAIN_TYPOS` in
`lib/utils/email-typo.ts`. No other change is needed. Add a matching case to
`tests/unit/lib/email-typo.test.ts` if it covers a new provider.
```

- [ ] **Step 2: Commit**

```bash
git add docs/email-typo-guard.md
git commit -m "Document email typo-guard"
```

---

## Self-Review Notes

- **Spec coverage:** util (Task 1), component (Task 2), wiring into the 3 rider
  forms on blur (Task 3), tests (Task 1), docs (Task 4). `control-card-form`
  intentionally excluded per spec. Server `validateEmail()` unchanged per spec.
- **Type consistency:** `suggestEmailCorrection(string): string | null` used
  identically across util, component, and tests. Component props
  `{ email, onAccept }` match Task 3 call sites.
- **No placeholders:** all steps contain concrete code and commands.
