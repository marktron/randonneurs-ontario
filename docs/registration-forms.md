# Registration Form Building Blocks

The three registration forms (scheduled events, fleche, permanents) share their
rider-details plumbing. When touching registration UI, change the shared pieces —
don't re-inline them (see GitHub issue #82 for the duplication this replaced).

## Modules

| Module                                             | Owns                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/registration-storage.ts`                      | The `ro-registration` localStorage record (`SavedRegistrationData`), including `brevetCardType` (`lib/brevet-card.ts`). Also read by `control-card-form.tsx` and `my-rides-section.tsx`. A record saved before this field existed simply has no key — `getSavedRegistrationData` returns it as-is; the hook normalises on read. |
| `hooks/use-registration-form.ts`                   | Rider-field state (including `brevetCardType`, defaulting to `'paper'`), load/persist of saved data, error/success/membership/match-dialog state, a11y focus+scroll effects, `handleRegistrationResult()` branching, optional upcoming-events fetch.                                                                            |
| `components/registration/registration-fields.tsx`  | `RegistrationError`, `RiderInfoFields` (name/email/phone/gender), `EmergencyContactFields`, `BrevetCardTypeField` (paper/digital brevet card radio choice — omitted from the flèche form, which has no digital card), `ShareRegistrationCheckbox`, `NotesField`. All take the hook's return value as `form`.                    |
| `components/registration/registration-success.tsx` | `RegistrationSuccess` (green checkmark), `UpcomingEventsLoading`, `UpcomingEventsSection`, `UpcomingEventCard`. Also used by `result-submission-form.tsx`.                                                                                                                                                                      |
| `components/registration/registration-dialogs.tsx` | `RegistrationDialogs` — rider-match dialog, membership error modal, and the email-typo confirmation dialog.                                                                                                                                                                                                                     |
| `components/registration/email-confirm-dialog.tsx` | `EmailConfirmDialog` — blocking "did you mean …?" confirmation raised by the server-side typo guard. See [email-typo-guard.md](email-typo-guard.md).                                                                                                                                                                            |

## How a form is assembled

Each form keeps only its unique sections (fleche team picker, permanent
route/date/direction section) and its own submit handler:

1. `const form = useRegistrationForm({ upcomingEventsEventId })` — pass an event
   id to fetch "More Upcoming Events" after success; omit for permanents.
2. The submit handler calls the right server action with `...form.riderPayload`
   plus form-specific fields, inside `form.startTransition`. Factor this into a
   `submitRegistration(…, emailOverride?)` helper the submit handler and the
   email-confirmation retry can both call — the retry has no form event to read
   `notes` from, so stash it on every submit rather than only `onNeedsMatch`.
3. Pass the result to `form.handleRegistrationResult(result, { onNeedsMatch })`.
   `onNeedsMatch` stashes context needed by the follow-up
   `completeRegistrationWithRider` call (pending notes / pending event id).
4. Add a `handleEmailConfirm(accepted)` that calls
   `form.acceptEmailSuggestion()` or `form.keepTypedEmail()` and resubmits with
   the returned address. Both resolvers **return** the address rather than only
   setting state, because the resubmit fires in the same tick and would
   otherwise still read the old value.
5. Render
   `<RegistrationDialogs form={form} onSelectRider={…} onConfirmEmail={handleEmailConfirm} />`
   after the form.

## Testing

- `tests/unit/lib/registration-storage.test.ts` and
  `tests/unit/hooks/use-registration-form.test.ts` cover the shared modules.
- The per-form test files exercise the shared components through each form.
