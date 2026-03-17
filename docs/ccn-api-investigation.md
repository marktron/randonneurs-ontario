# CCN API Investigation

Author: Mark Allen
Status: Investigated
Date: March 15, 2026

## Goal

Determine what the CCNBikes API can provide beyond the single endpoint we currently use for membership verification.

## Current usage

We use the `event_app/registration-search/` endpoint to verify membership during event registration. See [registration-check.md](./registration-check.md) for full details.

```
GET https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen
```

This returns: `id`, `full_name`, `team_name`, `team_category`, `registration_category`, `city`, `country`, `event`, `event_id`, `has_waiver_applications_missing_signatures`, `associated_purchased_groups`, `question_answers`, `seed_mark`, `primary_affiliation`.

## Authentication

The API supports HTTP Basic Auth with user credentials (`username:password`). This grants access to a subset of read-only public endpoints. Many endpoints (identities, detailed registrations, org admin features) return `401 - Authentication credentials were not provided` even with basic auth — these require org-level admin credentials or session-based auth that isn't available through the API alone.

No token-based auth endpoint was found at the standard DRF location (`api-token-auth/`).

## API directory

The root at `GET /en/rest/v2/` returns a JSON dictionary of all 200+ endpoints. This is the best way to discover available resources.

## Accessible endpoints (with basic auth)

### Event details

```
GET /en/rest/v2/events/{id}/
```

Returns full event details: name, slug, status (`AC` = active, `CL` = closed), organization, contact info, registration dates, descriptions, logo, theme settings.

```
GET /en/rest/v2/events/?search={term}
GET /en/rest/v2/events/?name={term}
```

Search events by name. Only returns currently active events — past/archived events are not returned by search, but can be accessed directly by ID.

### Registration categories

```
GET /en/rest/v2/registration-categories/?event={event_id}
```

Returns registration categories for an event with pricing, capacity, and live registration counts via `number_of_complete_registrations`. For RO 2026 (event 21392), the categories are:

| ID     | Name                                      | Price  | Registrations |
| ------ | ----------------------------------------- | ------ | ------------- |
| 117611 | Individual Membership                     | $40.00 | 79            |
| 117610 | Family Membership > PRIMARY FAMILY MEMBER | $40.00 | 14            |
| 117609 | Additional Family Member                  | $0.00  | 11            |
| 117612 | Trial Member                              | $0.00  | 2             |

### Registration search (existing)

```
GET /en/rest/v2/event_app/registration-search/?event_id={id}&search={name}
```

The only query params that actually filter results are `event_id` (required) and `search`. Pagination via `page` and `page_size` works. Other params (`city`, `country`, `ordering`, `registration_category`) are accepted but silently ignored.

### Club listings directory

```
GET /en/rest/v2/listing_app/club-listings/?search={term}
GET /en/rest/v2/listing_app/club-listings/{listing_id}/
```

This is the key to discovering historical event IDs. Each listing maps to an event via the `event_id` field in the detail response.

### Reference data

```
GET /en/rest/v2/countries/?search={term}
GET /en/rest/v2/provinces/?country={country_id}
GET /en/rest/v2/membership-organizations/
GET /en/rest/v2/membership_app/organizations/
GET /en/rest/v2/membership_app/choices/identity-membership-statuses/
GET /en/rest/v2/event_app/event_types/
```

Membership statuses: `HOLD` (Manual Hold), `PROC` (Processing), `ISSU` (Issued), `CANC` (Cancelled), `SUSP` (Suspended), `EXP` (Expired), `RQAA` (Requires Admin Attention), `BCO` (Being Checked Out).

Event types: `CL` (Club), `EV` (Event).

## Historical RO membership events

Each membership year is a separate "event" in CCNBikes. Discovered via `listing_app/club-listings/?search=Randonneurs+Ontario`:

| Year | Event ID | Listing ID | Members       | Status |
| ---- | -------- | ---------- | ------------- | ------ |
| 2026 | 21392    | 29253      | 106           | Active |
| 2025 | 18402    | 25639      | 267           | Closed |
| 2024 | 15230    | 21946      | 230           | Closed |
| 2023 | 12417    | 17895      | 186           | Closed |
| 2022 | 9730     | 13719      | 195           | Closed |
| 2021 | 8126     | 11144      | 134           | Closed |
| 2020 | 6625     | 8990       | 99            | Closed |
| 2019 | 4294     | 5304       | 169           | Closed |
| 2018 | 3034     | 3395       | 196           | Closed |
| 2017 | 1690     | 1741       | Auth required | Closed |
| 2016 | 791      | 801        | Auth required | Closed |
| 2015 | 442      | 432        | Auth required | Closed |
| 2014 | 44       | 43         | Auth required | Closed |

The `registration-search` endpoint works for events from 2018 onward. Events from 2017 and earlier return 401 even with basic auth.

## Organization details

- **Organization ID:** 1654 (Randonneurs Ontario)
- **Affiliation/Node ID:** 107371 (used in `primary_affiliation` on registration records, and as `club_node_id` on the event)
- **Contact:** treasurer@randonneursontario.ca

## Inaccessible endpoints (require org admin auth)

| Endpoint                               | What it likely contains                        |
| -------------------------------------- | ---------------------------------------------- |
| `registrations/{id}/`                  | Full registration details                      |
| `event_app/registrations/{id}/`        | Full registration details                      |
| `identities/?search=`                  | Personal details (address, emergency contacts) |
| `identity-attributes/`                 | Custom attribute definitions                   |
| `identity-attribute-values/`           | Custom attribute values per identity           |
| `membership_app/identity-memberships/` | Membership history per person                  |
| `memberships/`                         | Membership records                             |
| `events/config/{id}/`                  | Event configuration                            |
| `event_app/organizations/{id}/`        | Org admin details                              |
| `orders/`                              | Financial/order data                           |
| `nodes/`                               | Organizational hierarchy                       |

## What we can do now

1. **Membership verification across years** — query `registration-search` against each historical event ID (2018-2026) to check if a person has been a member in past years.
2. **Live membership counts** — use `registration-categories/?event={id}` to get current registration counts by category without fetching all members.
3. **Discover new year events** — when a new membership year is created, find it via `listing_app/club-listings/?search=Randonneurs+Ontario`.

## New membership polling

### Problem

CCN has no webhook support. The admin dashboard can send email notifications on new registrations, but parsing emails is fragile. We need a way to detect new members programmatically.

### Approach

Poll the `registration-search` endpoint and compare against known registrations. Registration IDs are strictly sequential and correlate with checkout timestamps, so any ID higher than the last seen value is a new member.

Verified against the CSV export: the lowest ID (11668169, David Thompson) checked out on 2025/12/16 and the highest (11697716, Corina Radoiu) on 2026/03/09. No exceptions to the ordering.

### How it works

1. Store the highest seen registration `id` in Supabase (e.g. a `ccn_sync_state` table or app settings row).
2. On a schedule (cron or Supabase pg_cron), fetch all pages of `registration-search/?event_id={current_event_id}`.
3. Filter results where `id > last_seen_id`.
4. Process new members (update local membership records, send welcome notifications, etc.).
5. Update `last_seen_id` to the new maximum.

### Considerations

- **No server-side filtering or sorting.** The endpoint ignores `ordering`, `city`, `country`, and `registration_category` params. Only `search` and `event_id` filter results. So we must fetch all pages and filter client-side.
- **Volume is small.** RO has 100-270 members per year, which fits in 2-3 pages at the default page size. The full fetch is cheap.
- **Polling frequency.** Every 15-30 minutes is reasonable. New members trickle in — there's no burst scenario where minutes matter.
- **Year rollover.** When a new membership year starts, discover the new event ID via `listing_app/club-listings/?search=Randonneurs+Ontario` and update the configured event ID. This could be automated or done manually once per year.
- **No auth beyond basic.** This uses the same unauthenticated `registration-search` endpoint we already use for membership verification. No additional credentials needed.

## What still requires org admin access

- Address, emergency contact, or other personal details
- Per-person membership history (without querying each year individually)
- Detailed registration records
- Financial data

The most practical path to this data is to contact CCNBikes about org-level API credentials or use CSV exports from the admin dashboard.
