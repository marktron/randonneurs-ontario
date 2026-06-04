# Email typo-guard

Riders sometimes mistype their email domain during registration (e.g.
`gmail.co` instead of `gmail.com`). Such addresses pass basic validation but the
confirmation email fails to deliver at AWS SES and eventually hard-bounces,
leaving the rider with no confirmation and no signal that anything went wrong.

The typo-guard catches common domain typos at the point of entry and offers a
one-click correction. It is **soft and non-blocking** — it only suggests, never
rejects.

## How it works

- `lib/utils/email-typo.ts` exports `suggestEmailCorrection(email)`, a pure
  function that lowercases and trims the input, splits on the last `@`, and
  looks the domain up in a curated `DOMAIN_TYPOS` map (`wrong → correct`). It
  returns the corrected full address, or `null` when the domain is not a known
  typo. It never throws.
- `components/email-typo-suggestion.tsx` (`<EmailTypoSuggestion>`) renders a
  soft "Did you mean …?" hint with a one-click correction button. The button
  carries an `aria-label` so screen-reader users hear the full suggested address.
  It renders nothing when there is no suggestion.
- The hint is wired into the three rider-facing registration forms
  (`registration-form`, `fleche-registration-form`,
  `permanent-registration-form`). Each form keeps a `blurredEmail` state and
  passes it to the component, so the hint appears **on blur** (after the rider
  leaves the email field) and clears as soon as they edit the field again.

The guard never blocks submission. Server-side `validateEmail()` in
`lib/utils/validation.ts` remains the backstop for genuinely malformed input.

The `control-card-form` is intentionally excluded — its email is an organizer
self-entering their own address on a printed control card, a different flow with
lower stakes.

### A note on `.co` entries

The `DOMAIN_TYPOS` map intentionally includes `.co` variants (`gmail.co`,
`hotmail.co`, etc.). `.co` is a real ccTLD (Colombia), so a legitimate
`@gmail.co` address would see a spurious suggestion. This is acceptable because
the hint is non-blocking — a rare legitimate `.co` user simply ignores it — and
`gmail.co` is the exact typo that motivated this feature.

## Extending the list

To cover a newly observed typo, add a `'wrong-domain': 'correct-domain'` entry
to `DOMAIN_TYPOS` in `lib/utils/email-typo.ts`. No other change is needed. Add a
matching assertion to `tests/unit/lib/email-typo.test.ts` if it introduces a new
provider.
