# Registration Management

Self-service registration management via token-based capability URLs. Riders can cancel registrations and submit early results without needing a user account.

## How it works

1. When a rider registers, a `management_token` (UUID) is created on their registration record
2. The confirmation email includes a "Manage registration" link: `/registration/manage/[token]`
3. This link serves as a smart router throughout the event lifecycle
4. Cancelling preserves the token (the "cancelled" manage page stays reachable), and re-registering revives the same row with the same token. If the revived row has no token — cancellations between 2026-03-18 and 2026-03-27 nulled it — re-registration generates a fresh one (`createRegistrationRecord` in `lib/actions/registration/finalize.ts`)

## Management page states

| Condition                                      | Behavior                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Invalid token                                  | 404                                                                                  |
| Result exists with matching `submission_token` | Redirect to `/results/submit/[token]`                                                |
| Registration cancelled                         | Static "cancelled" message with re-register link                                     |
| Event cancelled                                | Static "event cancelled" message                                                     |
| Event scheduled, before start time             | Cancel button                                                                        |
| Event scheduled, after start time, registered  | `createEarlyResult` mints a pending row, then redirects to `/results/submit/[token]` |
| Event completed/submitted, no result yet       | Same as above — `createEarlyResult` is idempotent and handles missing-row recovery   |

### Pre-rides

If an admin has recorded an approved pre-ride start on the registration
(`pre_ride_date`/`pre_ride_start_time`), the manage page shows the pre-ride date and time
with a "Pre-ride" badge in place of the event's scheduled start, and the rider's digital
brevet card runs entirely off that start. See `docs/digital-brevet-card.md` §17.

## Token sharing

When results are created (by cron or early submission), the registration's `management_token` value is copied to the result's `submission_token`. This means the same link works throughout the lifecycle, and is also the URL encoded in the brevet card "Submit Your Results" QR code:

- Before event: manage registration (cancel)
- After event start: redirects straight to result submission form (creating the result row on demand if needed)
- After results created: redirects to result submission form via the existing-result check

## Database columns

- `registrations.management_token` — UUID, unique, auto-generated
- `registrations.cancelled_at` — timestamp of cancellation

## Key files

- `app/registration/manage/[token]/page.tsx` — Server component (state router)
- `components/registration-manage.tsx` — Client component (UI)
- `lib/actions/manage-registration.ts` — Server actions (cancel, create early result)
- `lib/email/templates.ts` — Cancellation email template
- `lib/email/send-registration-email.ts` — Email sending function

## Cancellation rules

- Allowed when event status is `scheduled` (not based on start time)
- Both `registered` and `incomplete: membership` registrations can be cancelled
- Re-registration after cancel reuses the same row (upsert), preserving the management token
- Fleche team captains see a warning that team members won't be auto-cancelled

## Early result submission

- Only allowed after event start time (uses `createTorontoDate` for timezone)
- Creates a pending result with `submission_token = management_token`
- Idempotent: if result already exists, returns existing token

## Admin cancellation

Admins can cancel a rider's registration from the event detail page (`/admin/events/[id]`).

- Cancel button (UserX icon) appears in each rider's row when:
  - Event status is `scheduled`
  - Registration status is `registered` or `incomplete: membership`
  - No result exists yet for the rider
- Confirmation dialog prevents accidental cancellation
- Action is audit-logged with admin ID
- Rider moves from the active table to a "Cancelled" section below (optimistic UI via local state)
- Cancelled registrations are also loaded from the database on page load, so they persist across reloads
- Server action: `adminCancelRegistration` in `lib/actions/results.ts`

## Admin un-cancellation

Riders can un-cancel themselves by re-registering, which revives their existing row. Organizers have two equivalent paths on the event detail page:

- **Restore button** (UserCheck icon) on each row of the "Cancelled" section — confirmation dialog, then the rider returns to the registration list. Server action: `adminRestoreRegistration` in `lib/actions/results.ts`
- **Add Rider** — selecting a rider whose registration is `cancelled` or `incomplete: membership` revives that row instead of reporting "already registered" (`addRegistration`)

Both paths:

- Reuse the existing row, because `registrations` has a UNIQUE `(event_id, rider_id)`; a second insert would violate it
- Set `status = 'registered'` and clear `cancelled_at`
- Preserve `notes`, `team_name`, and `is_team_captain` from the original registration
- Regenerate `management_token` when it is null (cancellations between 2026-03-18 and 2026-03-27 nulled it), matching `createRegistrationRecord`
- Bust the `registrations`, `events`, and `event-<slug>` cache tags so the public event page reflects the change immediately
- Are audit-logged with the admin ID
- Send **no** email — the rider is not notified, unlike the rider-driven re-registration flow

### Optimistic cancellation state

Admin cancellation hides the rider's row client-side instead of re-fetching, and `router.refresh()` **preserves client state**. So anything that un-cancels a rider must also drop that optimistic entry, or the restored registration stays hidden until a full page reload — even though the server props are correct.

`localCancelled` in `event-results-manager.tsx` is the single source of truth for this: entries in it are hidden from the participant list and shown under "Cancelled". Cancelling appends (with the real `rider_id`); Restore removes by registration id; `AddRiderDialog` reports the added rider through `onRiderAdded`, which removes by rider id.

`adminRestoreRegistration` rejects a registration that is not `cancelled` ("This registration is not cancelled"). Restoring always lands on `registered`; the pre-cancellation status is not recorded, so a row that was `incomplete: membership` before cancellation comes back as a full registration — the same organizer override that "Add Rider" already applies.
