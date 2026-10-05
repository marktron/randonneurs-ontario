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

## Permanent start picker

The permanent form adds two pieces on top of the shared ones.

- **Start picker.** On loop routes, a "Start somewhere else on the route" button opens `components/route-start-picker.tsx`, a Leaflet map of the route. The rider taps the route, or types a distance in the "distance into the posted route" field (measured along the route as posted, even for a reversed ride), and names the start. A tap snaps to the nearest point on the route; where the route passes that spot more than once the rider chooses the pass. The form gets the track and the route's controls from `getPermanentRouteTrack` and shows the picker only when the track is a loop. It sends the server only `startOffsetKm` and the place name. The server derives coordinates from the cached track.
- **Starting at a control.** The map marks the route's controls with black dots. Controls at the posted start or finish (within 0.1 km of either end) get no dot, because the white posted-start dot covers them. Controls that share a name and sit within 150 m of each other are one dot, and its tooltip lists every pass ("Cafe, 30.0 km and 120.0 km"). `offeredControlPlaces` in `lib/routeTrack.ts` does this grouping. Tapping a dot sets the start to that control's own distance, not to a re-snapped tap position. If the control is passed more than once, the first pass is chosen and the pass chooser offers the others. Below the map, an "Or start at a control" list gives the same choice for keyboard and small-screen use, with one option per pass in route order. The list shows the current control when the chosen start is exactly one, and it is left out when the route offers no controls. Picking a control, from a dot or from the list, fills "Name of your start location" with the control's name when the field is empty or still holds an earlier suggestion. Text the rider typed is never replaced. A plain map tap or a typed distance leaves the name alone, and changing route clears the start, the name and the suggestion.
- **Existing-ride lock.** When the rider picks a route, date and direction, the form calls `getExistingPermanentRide`. If a ride already exists, a notice states its start, the time field shows that ride's time and is disabled, and the picker is hidden; the form submits the existing ride's time and start. The lookup returns nothing for a ride nobody is on that can be taken over (see "Direction and alternate start" in `docs/control-cards.md`), so the form stays editable in that case. Start time must be `HH:MM`.

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
