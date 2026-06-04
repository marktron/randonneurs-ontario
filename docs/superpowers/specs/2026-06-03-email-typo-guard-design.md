# Email typo-guard — design

**Date:** 2026-06-03
**Status:** Approved

## Problem

Riders occasionally mistype their email domain during registration (e.g.
`haemdoc2@gmail.co` instead of `gmail.com`). The address passes the existing
loose validation (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), so the registration succeeds
but the confirmation email never arrives — it fails at SES with a transient
`421 ... Unable to connect to remote host` and eventually hard-bounces. The
rider is left without confirmation and no signal that anything went wrong.

A real-world example: a DeliveryDelay/bounce on a "Registration Received: St
Joseph Island 200" email sent to `haemdoc2@gmail.co`.

## Goals

- Catch common email-domain typos at the point of entry, before submission.
- Make correcting the typo a single click.
- Never block a legitimate submission (no false-positive rejections).

## Non-goals

- Hard server-side rejection of suspected typos.
- Distance/edit-distance ("mailcheck"-style) fuzzy matching.
- The `control-card-form` organizer email (different flow, organizer self-entry,
  lower stakes).

## Behavior

Soft, client-side, non-blocking suggestion:

1. The rider types their email into a registration form.
2. **On blur** (leaving the field), if the domain matches a known typo, a small
   hint appears under the field: _"Did you mean haemdoc2@gmail.com?"_ with a
   **Use this** action.
3. Clicking **Use this** rewrites the field to the corrected address and clears
   the hint.
4. Submit always works regardless of whether the hint is shown or acted on. The
   existing server-side `validateEmail()` remains the backstop for genuinely
   malformed input.

Triggering on blur (not live per-keystroke) avoids flicker while the rider is
mid-typing their domain.

## Components

### 1. `lib/utils/email-typo.ts` (pure function)

```ts
suggestEmailCorrection(email: string): string | null
```

- Trims and lowercases; splits the address on the last `@`.
- Looks the domain up in a curated `DOMAIN_TYPOS` map of
  `wrong-domain → correct-domain` (~30 entries covering the major providers:
  gmail, hotmail, yahoo, outlook, icloud, etc. — e.g. `gmail.co → gmail.com`,
  `gmial.com → gmail.com`, `gmail.con → gmail.com`, `hotmial.com → hotmail.com`,
  `yahooo.com → yahoo.com`).
- Returns the corrected **full** address (original local-part + corrected
  domain) when the domain is a known typo; otherwise `null`.
- Returns `null` for malformed input (no `@`, empty domain, etc.) — it never
  throws.

No React; fully unit-testable in isolation.

### 2. `components/email-typo-suggestion.tsx` (thin client component)

```tsx
<EmailTypoSuggestion email={email} onAccept={setEmail} />
```

- Calls `suggestEmailCorrection(email)`.
- Renders nothing when there is no suggestion.
- Otherwise renders the "Did you mean …? Use this" line; clicking **Use this**
  calls `onAccept(corrected)`.
- Styling consistent with existing form hint/helper text (see
  `docs/style_guide.md`).

### 3. Wire into the three rider forms

Drop `<EmailTypoSuggestion email={email} onAccept={setEmail} />` directly below
the email `<Input>` in:

- `components/registration-form.tsx`
- `components/fleche-registration-form.tsx`
- `components/permanent-registration-form.tsx`

All three already hold email in a `const [email, setEmail] = useState('')`, so
each change is ~1 line.

## Testing

Unit tests for `suggestEmailCorrection`:

- Known typo domains return the corrected full address.
- Clean/valid addresses (`@gmail.com`, `@randonneursontario.ca`) return `null`.
- Case-insensitivity (`Foo@GMAIL.CO` → `foo@gmail.com`).
- Local-part is preserved exactly (including dots/plus tags).
- Malformed input (no `@`, trailing `@`, empty) returns `null` without throwing.

The component is thin enough to rely on the util's coverage. UI verified with a
Playwright screenshot of an affected registration page.

## Extending the list

To cover a newly observed typo, add a `wrong → correct` entry to the
`DOMAIN_TYPOS` map in `lib/utils/email-typo.ts`. No other changes needed.
