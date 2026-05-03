# Registration Management

Self-service registration management via token-based capability URLs. Riders can cancel registrations and submit early results without needing a user account.

## How it works

1. When a rider registers, a `management_token` (UUID) is created on their registration record
2. The confirmation email includes a "Manage registration" link: `/registration/manage/[token]`
3. This link serves as a smart router throughout the event lifecycle

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
