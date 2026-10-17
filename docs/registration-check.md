# Membership Verification

Author: Mark Allen
Status: Implemented
Last update: Feb 1, 2026

## Background

To particpate in Randonneurs Ontario events, members need to have already joined the club using our third party provider, CCN Bikes. Once they have joined, there is an API we can call to check the status of a members registration. We want to validate that every member is an active member when they register for an event.

### How memberships work

Club memberships are good for the season, which is the calendar year. Membership is always checked for the event's season: the calendar year of `event_date`, stored as `events.season` (e.g. `2026`). It is not read from `NEXT_PUBLIC_CURRENT_SEASON`.

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
2. Find or create rider. The email lookup is case-insensitive — `rider@Example.com` and `rider@example.com` resolve to the same rider. If the rider is found by email, their name is never overwritten (only gender and emergency contact are updated). A `rider_merges` audit entry is created when the submitted name differs so admins can spot mismatches.
3. If rider match needed (fuzzy name match), return match candidates and stop.
4. Check `rider_memberships` for `(rider_id, event_season)`. If found and NOT Trial Member, skip to step 7. If Trial Member, proceed to step 5 to check for upgrade. If not found, proceed to step 5.
5. Call CCN API with registrant's full name. If CCN returns a result: upsert into `rider_memberships` (with `ccn_id`, `membership_type`, `city`, `country`, `chapter_id`), then continue. If Trial Member and CCN returns a full membership type, the row is updated (upgrade).
6. If CCN returns no result and no existing membership: create registration with `status = 'incomplete: membership'`, send email with warning, show error modal, stop. If Trial Member and CCN returns no result: preserve existing Trial data (graceful degradation).
7. If membership type is Trial Member: check if trial is already used (results with status in `finished`, `dnf`, `otl`, `dq` OR other registrations for upcoming events (`event_date >= today`) in the event's season). If used, show error modal, stop.
8. Create registration with `status = 'registered'`, send confirmation email, revalidate, return success.

### Event registration

When someone registers for an event of any type, check to see if the registrant (as defined by email address) has a membership for the event's season (`events.season`). If they do, go ahead and complete the registration.

If we do not already have an entry in the `memberships` table for that user, query the CCN registration search (`https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id={id}`, sample queries below) with the registrant's name to verify membership. The CCN API requires no authentication. Each membership year is a separate CCN event with its own `event_id` (2026 is `21392`), so the id is resolved per season; see "Season discovery and the next-season gate". Map the API response field `registration_category` to our `memberships.type` column.

If the API returns a result, add that user's info to the `memberships` table and mark the registrations.status field as `registered`.

If the API does not return a valid result, mark the status as `incomplete: membership` and show an error modal that says the rider needs to join the club first, and link to /membership.

Use a single error modal component; the content will be either "no membership" (join the club first, link to /membership) or "trial used" (upgrade to full membership, link to /membership) depending on the failure reason.

The email we send registrants and chapter organizers (lib/email/send-registration-email.ts) should include the registrant's membership status in the email, e.g. "Membership type: Individual Membership". Use the same conditional content as the modal: if the registration's status is "incomplete: membership", add a prominent section at the top of the email saying their registration is not yet valid until they join the club. If the failure is due to trial used, add a prominent section saying they need to upgrade to a full membership to participate.

### Admin

In the admin tool, we want to show the membership status for registrants that need attention.

On /admin/events/[id], include registrations with status `incomplete: membership` in the list (do not filter them out—the page currently only fetches `status = 'registered'`). If a member has Trial Member status or is missing a membership row, display a badge next to their name. ("Trial" should be a secondary gray badge, "Missing membership" should be red).

On /admin/riders, show the current membership state in a column, no badging. If they are missing a membership, show nothing.

### Admin-added registrations

Admins can add a rider directly on `/admin/events/[id]` (the "Add Rider" dialog, `addRegistration` in `lib/actions/results.ts`) or restore a cancelled registration (`adminRestoreRegistration`). Neither entry point collects a name/email from a form, so nothing has checked membership before the row is written. Both now run the same membership check the rider-facing flow uses instead of writing `status: 'registered'` unconditionally.

A private helper, `resolveAdminRegistrationStatus(riderId, eventId)`, loads the rider's name and the event's chapter, then calls `getMembershipForRider` the same way `revalidateMembership` does:

- Membership found (and not a Trial Member who already used their trial): status `registered`, membership outcome `valid`.
- No membership on file: status `incomplete: membership`, outcome `none`.
- Trial Member whose trial is already used: status `incomplete: membership`, outcome `trial-used`.
- The CCN lookup throws: status `incomplete: membership`, outcome `check-failed` (logged via `logError`; the admin is never blocked from adding the rider).

The admin action always succeeds: adding or restoring a rider never fails because of membership. Only the resulting status differs, and the existing `incomplete: membership` exclusions (start lists, card printing, check-in) apply exactly as they do for the rider-facing flow. The audit log description gets a suffix (e.g. "— membership missing") whenever the outcome isn't `valid`, and the admin UI (`components/admin/add-rider-dialog.tsx`, `components/admin/event-results-manager.tsx`) shows a warning toast instead of a plain success toast in that case, naming the event's season and pointing at the "Missing membership" badge (`revalidateMembership`) for a later re-check.

### Trial Member

Trial Member status works differently from the other membership types. Riders can participate in only one event with Trial Member status before they need to purchase a full membership.

If a member tries to register for an event and has Trial Member status, check whether they have already "used" their trial:

1. **Results:** Any result for the event's season with status `finished`, `dnf`, `otl`, or `dq` counts as used. (`dns` does not count.)
2. **Upcoming registrations:** Any other registration for an upcoming event (`event_date >= today`) in the event's season means they have already committed their trial to an upcoming event. We want to prevent them from registering for another event on the trial tier—they must upgrade first.

If the trial is used, show the error modal (same component as no-membership, with "trial used" content) and do not complete the registration. If they have not used their trial event yet, process the registration as normal.

The registration confirmation email to users whose trial is invalid should include a prominent message at the top saying they need to upgrade to a full membership to participate in the ride.

## Season discovery and the next-season gate

Each membership year is its own CCN event, so the `event_id` for a season has to be found. `getMembershipSeasonStatus(season)` in `lib/ccn/client.ts` does this.

### Discovery

It reads `listing_app/club-listings/?search=Randonneurs+Ontario` (see `docs/ccn-api-investigation.md`) and keeps rows where `event.organization.id` is `1654` (Randonneurs Ontario) and the listing name matches `Membership (\d{4})`. Each match gives a season, a CCN event id, the event status and `registration_opens`. `registration_opens` has no offset and is Toronto local time, so it is parsed with `createTorontoDate`. Whether a season is open is worked out on every call, not when the listing is fetched, so a cached listing flips to open as soon as the clock passes `registration_opens`.

`getMembershipSeasonStatus(season)` returns one of four statuses:

- `open`: listed, `event.status` is `AC`, and `registration_opens` has passed.
- `closed`: listed but not taking registrations (a past year, or a next year created but not yet open). Membership searches still run against it.
- `none`: we have a good listing and it has no event for that season (and the season is not seeded). Nobody can hold that membership yet. `searchCCNMembership` logs this at info level and returns `{ found: false }`.
- `unknown`: no good listing is available (the fetch failed and nothing was cached) and the season is not seeded. We cannot tell whether the rider is a member, so `searchCCNMembership` throws `CCN membership listing unavailable` instead of reporting "not a member". The rider-facing flow turns that into "Registration failed" with nothing written; admin add/restore lands on `check-failed`.

The listing is cached in process: 1 hour after a success, 10 minutes after a failure. When a refetch fails, the last good listing keeps being served and the 10 minute window governs the next retry. Concurrent callers on a cold cache share one request. Each serverless instance has its own cache. A timeout is 10 seconds.

`CCN_MEMBERSHIP_EVENT_IDS` is consulted when discovery fails with nothing cached, or when the season is not in the listing. Every seeded season returns `open` with the seeded id. A listed season always wins over the seed.

`CCN_API_BASE` overrides the API base URL (used by tests).

### The gate

`registrationSeasonBlock(season)` in `lib/memberships/season-gate.ts` runs before anything is written:

- Season at or before the Toronto calendar year: allowed, no CCN call.
- Season after the Toronto calendar year: allowed only if the season is `open`. Anything else, including a failed lookup, blocks.

The comparison is against the clock (`torontoCalendarYear()`), not `NEXT_PUBLIC_CURRENT_SEASON`. Rolling that env var on January 1 is cosmetic and has no effect on the gate.

The gate is called in `registerForEvent`, `registerForPermanent` (on the date's season) and `completeRegistrationWithRider`, all in `lib/actions/register.ts`.

### Season rule

The event's season is strict: `events.season`, falling back to the year of `event_date`. There is no fallback to the next season's membership in November and December. A December 2026 ride needs a 2026 membership. Decided 2026-10-16.

### What riders see

- `/register/[slug]` for a next-season event whose membership is not open shows an alert ("Registration opens with {season} memberships") and a short closed box ("Registration is not open yet for {season} events") instead of the form. Cancelled and draft events keep their own closed states and skip the CCN lookup.
- If a submission reaches the server anyway, the action returns the refusal "Registration for {season} events opens once {season} memberships are available. Check back soon." No registration row is created and no email is sent.
- Once CCN opens that season's membership, registration opens within about two hours: up to one hour of listing cache plus the one-hour page cache on `/register/[slug]`.

### What admins see

Admin add and restore (`addRegistration`, `adminRestoreRegistration`) are not blocked by the gate. For a next-season event they run the normal membership check against that season, so with no membership on file the row lands as `incomplete: membership`.

### Deploy and yearly steps

1. Set `CCN_MEMBERSHIP_EVENT_IDS=2026:21392` in Vercel (production and preview) before the deploy reaches production.
2. Remove `CCN_ENDPOINT` from Vercel and local env files after the deploy. The code no longer reads it.
3. Run the flip script (below) after the deploy and before CCN opens the next membership season.
4. Each December or January, once CCN opens the new year's membership, add `<year>:<event id>` to `CCN_MEMBERSHIP_EVENT_IDS`. Find the id in the `event.id` of the "Randonneurs Ontario Membership <year>" row from `https://ccnbikes.com/en/rest/v2/listing_app/club-listings/?search=Randonneurs+Ontario`.

During a CCN listing outage on an instance with no cached listing:

- With the season seeded, discovery falls back to the seed, the season counts as open, and registration works as long as the membership search itself succeeds.
- Without the seed, the season is `unknown`: rider registration reports "Registration failed" and nothing is written, and a next-season event stays closed.

### Flip script (post-deploy, one-off)

Registrations written for next-season events before this shipped were checked against the current season and marked `registered`. After the deploy, run `scripts/flip-next-season-registrations.ts`. It lists `registered` rows on events dated after Dec 31 of the Toronto calendar year and, with `--apply`, sets them to `incomplete: membership`. A registration is skipped (and listed as skipped) when the rider already has a `rider_memberships` row for the event's season, since that row can only come from a check under the new code. Run the dry run first, then apply, then `POST /api/revalidate` with `{"tags":["registrations","events"]}`:

```bash
npx tsx scripts/flip-next-season-registrations.ts --env-file=.env.production.local
npx tsx scripts/flip-next-season-registrations.ts --env-file=.env.production.local --apply
```

## Sample queries

The URL to fetch a membership query from our third party partner is structured like `registration-search/?event_id={id}&search=[full_name]`, with the `event_id` resolved for the event's season, where `[full_name]` is the URL encoded first and last name of the registrant.

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

## Name mismatches between RO and CCN

CCN's `registration-search` endpoint searches by name only — it does not match against email, even though CCN stores it. When a rider's name on CCN differs from what they enter on RO (e.g. CCN has "Ludo Magne", RO registration is "Ludovic Magne"), the exact-name search returns nothing.

After an exact-name miss, `searchCCNMembership` retries with a surname-only search and ranks the candidates by fuzzy first-name match using `lib/utils/fuzzy-match.ts`. The fuzzy ranker handles:

- Hand-mapped nicknames (Bob/Robert, Mike/Michael — see `NICKNAME_MAP`)
- Natural-truncation short forms not in the map (Ludo/Ludovic, Sam/Samuel, Tom/Thomas) via a prefix heuristic that requires the shorter name to be ≥3 chars and the longer to be ≥2 chars longer
- Hyphenated first names, surname prefixes, and minor typos via Levenshtein distance

A surname-fallback match is accepted only if the top candidate scores ≥ 0.85 **and** no other candidate scores within 0.15 of the leader. When two distinct family members both fuzzy-match closely (e.g. mother/daughter "Ann Wong" + "Anne Wong" against "Anna Wong"), the lookup returns `{ found: false }` rather than guess — the admin can resolve the ambiguity by correcting the rider's name to match CCN exactly and re-clicking the "Missing membership" badge.

## Future improvements

- **CCN polling for new members:** The `ccn_id` column on `rider_memberships` enables detecting new registrations by polling the CCN API and comparing against the highest known `ccn_id`. See `docs/ccn-api-investigation.md` for the polling approach.

## Implementation Notes

### Membership storage (March 2026 update)

Membership verification now reads and writes the `rider_memberships` table (not the older `memberships` table). When a rider registers:

1. Check `rider_memberships` for `(rider_id, event_season)`
2. If found and NOT Trial Member — use cached data, skip API call
3. If found and Trial Member — re-check CCN API to detect upgrades (trial → full membership)
4. If not found — query CCN API, upsert result into `rider_memberships` with `ccn_id`, `membership_type`, `city`, `country`, and `chapter_id`

When CCN returns multiple results for a single rider (e.g. a Trial registration plus a later Individual upgrade in the same season), the client prefers any non-Trial match so the upgrade overrides the cached Trial row. To re-check existing Trial rows after deploying a fix or for routine cleanup, run `npx tsx scripts/recheck-trial-memberships.ts` (defaults to dry-run; pass `--apply` to write; pass `--env-file=.env.production.local` to point at prod).

The `ccn_id` column stores the CCN registration ID (per-season, e.g. `11671361`). This is different from `riders.ccn_id` which is the person-level CCN identity ID.

Chapter assignment: When writing from the API, `chapter_id` is set to the event's chapter if it's a real geographic chapter (Toronto, Ottawa, Simcoe-Muskoka, Huron) and no existing value is present.

### Files Modified/Created

- `supabase/migrations/20260201120000_add_memberships_table.sql` - Creates memberships table (legacy)
- `supabase/migrations/20260315120000_add_rider_memberships.sql` - Creates rider_memberships table
- `supabase/migrations/20260317120000_add_ccn_id_to_rider_memberships.sql` - Adds ccn_id column
- `lib/ccn/client.ts` - CCN API client: season discovery (`getMembershipSeasonStatus`) and membership search (returns city, country)
- `lib/memberships/season-gate.ts` - next-season registration gate
- `scripts/flip-next-season-registrations.ts` - one-off post-deploy flip
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

- `CCN_API_BASE` - optional override of the CCN API base URL (default `https://ccnbikes.com/en/rest/v2`)
- `CCN_MEMBERSHIP_EVENT_IDS` - seed of season to CCN event id pairs, e.g. `2026:21392,2027:23000`. Consulted when discovery fails or when a season is not in the listing; every seeded season counts as open. Set `2026:21392` in production.
- `NEXT_PUBLIC_CURRENT_SEASON` - display default for admin filters, records and reports. Not used for membership verification or the gate.

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
