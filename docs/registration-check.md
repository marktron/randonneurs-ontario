# Membership Verification

Author: Mark Allen
Status: Implemented
Last update: Feb 1, 2026

## Background

To particpate in Randonneurs Ontario events, members need to have already joined the club using our third party provider, CCN Bikes. Once they have joined, there is an API we can call to check the status of a members registration. We want to validate that every member is an active member when they register for an event.

### How memberships work

Club memberships are good for the season, which is generally the calendar year. For our purposes, we'll just say the season is the NEXT_PUBLIC_CURRENT_SEASON env variable (e.g. `2026`).

Memberships can be one of four types:

- `Individual Membership`
- `Additional Family Member`
- `Family Membership > PRIMARY FAMILY MEMBER`
- `Trial Member`

## Database migrations

We will want to create a new `memberships` table and extend the `registrations` table.

### memberships table

Table structure:

- id
- season
- rider_id (foreign key to riders table)
- membership_id (int, e.g. `11669640`)
- type (string, one of the four membership types above; maps from CCN API `registration_category`)
- created_at
- updated_at

Add a unique constraint on `(rider_id, season)` and an index on `(rider_id, season)` for lookups.

### registrations.status

The current schema only allows `registered` and `cancelled`. Add a migration to extend the status constraint to include `incomplete: membership` for registrations where membership verification failed.

## New functionality

### Registration flow (step-by-step)

1. Validate input.
2. Find or create rider. If the rider is found by email, their name is never overwritten (only gender and emergency contact are updated). A `rider_merges` audit entry is created when the submitted name differs so admins can spot mismatches.
3. If rider match needed (fuzzy name match), return match candidates and stop.
4. Check `rider_memberships` for `(rider_id, current_season)`. If found and NOT Trial Member, skip to step 7. If Trial Member, proceed to step 5 to check for upgrade. If not found, proceed to step 5.
5. Call CCN API with registrant's full name. If CCN returns a result: upsert into `rider_memberships` (with `ccn_id`, `membership_type`, `city`, `country`, `chapter_id`), then continue. If Trial Member and CCN returns a full membership type, the row is updated (upgrade).
6. If CCN returns no result and no existing membership: create registration with `status = 'incomplete: membership'`, send email with warning, show error modal, stop. If Trial Member and CCN returns no result: preserve existing Trial data (graceful degradation).
7. If membership type is Trial Member: check if trial is already used (results with status in `finished`, `dnf`, `otl`, `dq` OR other registrations for events with `event_date >= today`). If used, show error modal, stop.
8. Create registration with `status = 'registered'`, send confirmation email, revalidate, return success.

### Event registration

When someone registers for an event of any type, check to see if the registrant (as defined by email address) has a membership for the current season (as defined by NEXT_PUBLIC_CURRENT_SEASON). If they do, go ahead and complete the registration.

If we do not already have an entry in the `memberships` table for that user, query the CCN endpoint (CCN_ENDPOINT env variable = `https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392`, sample queries below) with the registrant's name to verify membership. The CCN API requires no authentication. The `event_id` in the URL does not change between seasons. Map the API response field `registration_category` to our `memberships.type` column.

If the API returns a result, add that user's info to the `memberships` table and mark the registrations.status field as `registered`.

If the API does not return a valid result, mark the status as `incomplete: membership` and show an error modal that says the rider needs to join the club first, and link to /membership.

Use a single error modal component; the content will be either "no membership" (join the club first, link to /membership) or "trial used" (upgrade to full membership, link to /membership) depending on the failure reason.

The email we send registrants and chapter organizers (lib/email/send-registration-email.ts) should include the registrant's membership status in the email, e.g. "Membership type: Individual Membership". Use the same conditional content as the modal: if the registration's status is "incomplete: membership", add a prominent section at the top of the email saying their registration is not yet valid until they join the club. If the failure is due to trial used, add a prominent section saying they need to upgrade to a full membership to participate.

### Admin

In the admin tool, we want to show the membership status for registrants that need attention.

On /admin/events/[id], include registrations with status `incomplete: membership` in the list (do not filter them out—the page currently only fetches `status = 'registered'`). If a member has Trial Member status or is missing a membership row, display a badge next to their name. ("Trial" should be a secondary gray badge, "Missing membership" should be red).

On /admin/riders, show the current membership state in a column, no badging. If they are missing a membership, show nothing.

### Trial Member

Trial Member status works differently from the other membership types. Riders can participate in only one event with Trial Member status before they need to purchase a full membership.

If a member tries to register for an event and has Trial Member status, check whether they have already "used" their trial:

1. **Results:** Any result for the current season with status `finished`, `dnf`, `otl`, or `dq` counts as used. (`dns` does not count.)
2. **Upcoming registrations:** Any other registration for an event with `event_date >= today` means they have already committed their trial to an upcoming event. We want to prevent them from registering for another event on the trial tier—they must upgrade first.

If the trial is used, show the error modal (same component as no-membership, with "trial used" content) and do not complete the registration. If they have not used their trial event yet, process the registration as normal.

The registration confirmation email to users whose trial is invalid should include a prominent message at the top saying they need to upgrade to a full membership to participate in the ride.

## Sample queries

The URL to fetch a membership query from our third party partner is structured like `CCN_ENDPOINT + &search=[full_name]`, where `[full_name]` is the URL encoded first and last name of the registrant.

### Registered member

```bash
❯ curl -i "https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen"
HTTP/2 200
date: Sun, 01 Feb 2026 21:01:07 GMT
content-type: application/json
content-length: 378
allow: GET, HEAD, OPTIONS
content-language: en
vary: origin, Cookie
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=ckghXeDMjkuGSE7YHlGEfH%2FK%2FyHuMGkDrnqthxy8IekLzBvc%2B%2FFe0BTAFly3X9uQxL64qrCMIL0H1VVUfp7Maqe0UrYY5bgv8Iuu"}]}
server: cloudflare
cf-ray: 9c7461d60e3ac4c7-YYZ

{"count":1,"next":null,"previous":null,"results":[{"id":11669640,"full_name":"Mark Allen","team_name":"","team_category":"","registration_category":"Individual Membership","city":"Toronto","country":"Canada","event":"Randonneurs Ontario Membership 2026","event_id":21392,"has_waiver_applications_missing_signatures":null,"associated_purchased_groups":[],"question_answers":[]}]}%
```

### Not a registered member

```bash
❯ curl -i "https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allenf"
HTTP/2 200
date: Sun, 01 Feb 2026 21:01:35 GMT
content-type: application/json
content-length: 52
allow: GET, HEAD, OPTIONS
content-language: en
vary: origin, Cookie
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=ZwtwenIMs9TAFOIQ4jn1SEqrM24nGYJuFOvTy%2BmkWYZVjt0PZ%2B98M%2FRWcnlcirhMcUYjS3LCioiAwMrjnxoK1zYgS5RpQFJguhUL"}]}
server: cloudflare
cf-ray: 9c74628a5bf5dda9-YYZ

{"count":0,"next":null,"previous":null,"results":[]}%
```

## Future improvements

- **CCN polling for new members:** The `ccn_id` column on `rider_memberships` enables detecting new registrations by polling the CCN API and comparing against the highest known `ccn_id`. See `docs/ccn-api-investigation.md` for the polling approach.

## Implementation Notes

### Membership storage (March 2026 update)

Membership verification now reads and writes the `rider_memberships` table (not the older `memberships` table). When a rider registers:

1. Check `rider_memberships` for `(rider_id, current_season)`
2. If found and NOT Trial Member — use cached data, skip API call
3. If found and Trial Member — re-check CCN API to detect upgrades (trial → full membership)
4. If not found — query CCN API, upsert result into `rider_memberships` with `ccn_id`, `membership_type`, `city`, `country`, and `chapter_id`

When CCN returns multiple results for a single rider (e.g. a Trial registration plus a later Individual upgrade in the same season), the client prefers any non-Trial match so the upgrade overrides the cached Trial row. To re-check existing Trial rows after deploying a fix or for routine cleanup, run `npx tsx scripts/recheck-trial-memberships.ts` (defaults to dry-run; pass `--apply` to write).

The `ccn_id` column stores the CCN registration ID (per-season, e.g. `11671361`). This is different from `riders.ccn_id` which is the person-level CCN identity ID.

Chapter assignment: When writing from the API, `chapter_id` is set to the event's chapter if it's a real geographic chapter (Toronto, Ottawa, Simcoe-Muskoka, Huron) and no existing value is present.

### Files Modified/Created

- `supabase/migrations/20260201120000_add_memberships_table.sql` - Creates memberships table (legacy)
- `supabase/migrations/20260315120000_add_rider_memberships.sql` - Creates rider_memberships table
- `supabase/migrations/20260317120000_add_ccn_id_to_rider_memberships.sql` - Adds ccn_id column
- `lib/ccn/client.ts` - CCN API client for membership verification (returns city, country)
- `lib/memberships/service.ts` - Membership verification service (checks rider_memberships then CCN API)
- `lib/actions/register.ts` - Registration flow with membership check, passes chapter_id
- `lib/email/templates.ts` - Email templates with membership status warnings
- `components/membership-error-modal.tsx` - Error modal component (no-membership, trial-used variants)
- `components/registration-form.tsx` - Form integration with membership error handling
- `components/admin/event-results-manager.tsx` - Shows "Missing membership" badge on registrations
- `components/admin/riders-table.tsx` - Shows membership column in riders list
- `app/admin/events/[id]/page.tsx` - Fetches incomplete registrations (reads rider_memberships)
- `app/admin/riders/page.tsx` - Includes rider_memberships in rider query
- `types/queries.ts` - Membership types

### Environment Variables

- `CCN_ENDPOINT` - CCN API endpoint URL (required for membership verification)
- `NEXT_PUBLIC_CURRENT_SEASON` - Current season year (existing, used to determine membership season)

### Testing

- Unit tests: `tests/unit/lib/ccn-client.test.ts`, `tests/unit/components/membership-error-modal.test.tsx`
- Integration tests: `tests/integration-real/memberships/membership-service.test.ts`, `tests/integration-real/registration/`

## Links to code

- `lib/actions/register.ts` — registration logic (`registerForEvent`, `registerForPermanent`, `completeRegistrationWithRider`)
- `lib/email/send-registration-email.ts` — sends confirmation email
- `lib/email/templates.ts` — email content (`buildRegistrationConfirmationEmail`, `RegistrationEmailData`)
- `components/registration-form.tsx` — form UI, error modal handling
- `app/admin/events/[id]/page.tsx` — admin event detail with registrations list
- `app/admin/riders/page.tsx` — admin riders list
