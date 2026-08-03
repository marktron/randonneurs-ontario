# Email typo-guard

Riders sometimes mistype their email domain during registration (e.g.
`gmail.co` instead of `gmail.com`). Such addresses pass basic validation but the
confirmation email fails to deliver at AWS SES and eventually hard-bounces,
leaving the rider with no confirmation and no signal that anything went wrong.

The typo-guard catches common domain typos and offers a one-click correction. It
works in two layers:

1. **An inline hint on blur** — advisory, easy to ignore or never see.
2. **A server-side confirmation on submit** — blocking, and the layer that
   actually prevents a misaddressed registration.

The second layer exists because the first is not enough on its own. The inline
hint only renders between leaving the email field and touching it again, so a
rider who autofills the form, or simply clicks straight through to Submit, can
register with a typo'd address without ever seeing it. Nothing downstream
noticed: `validateEmail()` is a bare syntax check, and `roger.com` is
syntactically perfect.

## How it works

Both layers share one detection function:

- `lib/utils/email-typo.ts` exports `suggestEmailCorrection(email)`, a pure
  function that lowercases and trims the input, splits on the last `@`, and
  fuzzy-matches the domain against a `KNOWN_DOMAINS` anchor list using edit
  distance. It returns the corrected full address, or `null` when no safe
  suggestion exists. It never throws.

### Layer 1 — the inline hint

- `components/email-typo-suggestion.tsx` (`<EmailTypoSuggestion>`) renders a
  soft "Did you mean …?" hint with a one-click correction button. The button
  carries an `aria-label` so screen-reader users hear the full suggested address.
  It renders nothing when there is no suggestion.
- The hint is wired into the three rider-facing registration forms
  (`registration-form`, `fleche-registration-form`,
  `permanent-registration-form`). Each form keeps a `blurredEmail` state and
  passes it to the component, so the hint appears **on blur** (after the rider
  leaves the email field) and clears as soon as they edit the field again.

This layer is advisory and cannot block anything. It is worth keeping because
catching the typo before submit is a better experience than a dialog after it.

### Layer 2 — the server-side confirmation

`validateContactFields()` in `lib/actions/registration/validation.ts` runs
`suggestEmailCorrection` on every registration submit. When it fires and the
payload does not carry `emailConfirmed: true`, validation fails with an
`emailSuggestion` field, which each of the three server actions
(`registerForEvent`, `registerForPermanent`, `completeRegistrationWithRider`)
passes back on `RegistrationResult`.

Client-side, `useRegistrationForm` branches on `emailSuggestion` and opens
`<EmailConfirmDialog>` (`components/registration/email-confirm-dialog.tsx`)
instead of setting the error banner — this is a question, not a failure. The
dialog has **no dismiss path**: both buttons resubmit with
`emailConfirmed: true`, either with the corrected address or with the one the
rider typed. Leaving them on a form that looks like it failed would be worse
than either outcome.

Two details worth preserving:

- The guard sits **before** the rate limiter in `validateContactFields`, so the
  confirmation round trip costs one rate-limit attempt in total, not two.
- Editing the email field clears `emailConfirmed` (`registration-fields.tsx`).
  A confirmation only ever covers the exact address it was shown.

`validateEmail()` in `lib/utils/validation.ts` remains the separate backstop for
genuinely malformed input.

The `control-card-form` is intentionally excluded — its email is an organizer
self-entering their own address on a printed control card, a different flow with
lower stakes.

### The edit-distance engine

The engine uses **Optimal String Alignment (OSA / restricted
Damerau-Levenshtein)** distance: a single character insertion, deletion,
substitution, or adjacent transposition each count as one edit.

`suggestEmailCorrection` works as follows:

1. **Manual override check.** `DOMAIN_TYPOS` (`wrong → correct`) is checked
   first. It is currently empty — the engine handles all observed typos. Add an
   entry here only to pin a distance-≥2 case the engine cannot reach (see
   [Extending](#extending-the-guard) below).
2. **Exact anchor match.** If the domain is already in `KNOWN_DOMAINS`, return
   `null` — nothing to suggest.
3. **Fuzzy match.** Find the nearest anchor by OSA distance. Suggest it only if
   the minimum distance is **exactly 1** and that minimum is reached by a
   **single anchor** (no tie).

The function returns `null` when:

- the domain already equals an anchor;
- no anchor is within one edit; or
- two anchors tie at distance 1.

**Tie example:** `yahoo.co` is one edit from both `yahoo.com` and `yahoo.ca`, so
the engine stays silent. By contrast, `gmail.co` still suggests `gmail.com`
because there is no `gmail.ca` anchor — the nearest match is unique. This
asymmetry is intentional.

### The `KNOWN_DOMAINS` anchor list

`KNOWN_DOMAINS` is derived from the most common domains in the `riders` table,
so it skews toward the real, partly-Canadian population of riders (hence entries
like `hotmail.ca`, `yahoo.ca`, `live.ca`, `sympatico.ca`). The engine only ever
suggests a domain from this list, which bounds the false-positive surface.

### A note on `.co` and short anchors

**`.co` domains.** `.co` is a real ccTLD (Colombia), so a legitimate
`@gmail.co` address gets a spurious "Did you mean gmail.com?" suggestion, and
now a confirmation dialog on submit as well. That is a real cost, but a bounded
one: the rider clicks "No, …@gmail.co is correct" once and the registration goes
through with the address they typed. Weighed against `gmail.co` — the exact typo
that motivated this feature — silently hard-bouncing, the trade favours asking.

**Short anchors.** For short anchors like `me.com` and `mac.com`, a single
character change is a large fraction of the string, so e.g. `we.com` gets nudged
toward `me.com`. Accepted for the same reason, and no real rider domain in the
data collides with these anchors.

**False positives now cost a click, not nothing.** Before the confirmation
layer, a wrong suggestion was free to ignore. It no longer is, so `KNOWN_DOMAINS`
should stay conservative — see [Extending](#extending-the-guard).

## Extending the guard

**To teach the guard a new provider** (the common case): add the domain to
`KNOWN_DOMAINS` in `lib/utils/email-typo.ts`. The engine will automatically
handle one-edit typos against it. Keep `KNOWN_DOMAINS` to genuinely popular
targets to avoid nudging legitimate rare domains.

**To pin a specific typo the engine cannot reach** (distance ≥ 2, or an
ambiguous case you want to resolve explicitly): add a `'wrong-domain':
'correct-domain'` entry to `DOMAIN_TYPOS`. This override is checked before the
engine, so it wins unconditionally.

In either case, add a matching assertion to
`tests/unit/lib/email-typo.test.ts`.

## Test coverage

- `tests/unit/lib/email-typo.test.ts` — the detection engine in isolation.
- `tests/integration/actions/register.test.ts` (`email typo confirmation guard`)
  — all three server actions refuse a typo once and let it through with
  `emailConfirmed: true`.
- `tests/unit/components/registration-form.test.tsx`
  (`email typo confirmation`) — the dialog opens instead of the error banner,
  and both buttons resubmit with the expected address.
