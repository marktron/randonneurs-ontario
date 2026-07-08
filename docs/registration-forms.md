# Registration Form Building Blocks

The three registration forms (scheduled events, fleche, permanents) share their
rider-details plumbing. When touching registration UI, change the shared pieces —
don't re-inline them (see GitHub issue #82 for the duplication this replaced).

## Modules

| Module                                             | Owns                                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/registration-storage.ts`                      | The `ro-registration` localStorage record (`SavedRegistrationData`). Also read by `control-card-form.tsx` and `my-rides-section.tsx`.                                                          |
| `hooks/use-registration-form.ts`                   | Rider-field state, load/persist of saved data, error/success/membership/match-dialog state, a11y focus+scroll effects, `handleRegistrationResult()` branching, optional upcoming-events fetch. |
| `components/registration/registration-fields.tsx`  | `RegistrationError`, `RiderInfoFields` (name/email/phone/gender), `EmergencyContactFields`, `ShareRegistrationCheckbox`, `NotesField`. All take the hook's return value as `form`.             |
| `components/registration/registration-success.tsx` | `RegistrationSuccess` (green checkmark), `UpcomingEventsLoading`, `UpcomingEventsSection`, `UpcomingEventCard`. Also used by `result-submission-form.tsx`.                                     |
| `components/registration/registration-dialogs.tsx` | `RegistrationDialogs` — rider-match dialog + membership error modal.                                                                                                                           |

## How a form is assembled

Each form keeps only its unique sections (fleche team picker, permanent
route/date/direction section) and its own submit handler:

1. `const form = useRegistrationForm({ upcomingEventsEventId })` — pass an event
   id to fetch "More Upcoming Events" after success; omit for permanents.
2. The submit handler calls the right server action with `...form.riderPayload`
   plus form-specific fields, inside `form.startTransition`.
3. Pass the result to `form.handleRegistrationResult(result, { onNeedsMatch })`.
   `onNeedsMatch` stashes context needed by the follow-up
   `completeRegistrationWithRider` call (pending notes / pending event id).
4. Render `<RegistrationDialogs form={form} onSelectRider={handleRiderSelection} />`
   after the form.

## Testing

- `tests/unit/lib/registration-storage.test.ts` and
  `tests/unit/hooks/use-registration-form.test.ts` cover the shared modules.
- The per-form test files exercise the shared components through each form.
