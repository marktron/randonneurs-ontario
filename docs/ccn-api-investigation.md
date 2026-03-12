# CCN API Investigation: Detailed Member Data

Author: Mark Allen
Status: Investigated
Date: March 12, 2026

## Goal

Determine whether the CCNBikes API can provide more detailed member information beyond what we currently use, specifically:

- Past membership years
- Address
- Emergency contact info

## Current usage

We use the public `event_app/registration-search/` endpoint to verify membership during event registration. See [registration-check.md](./registration-check.md) for full details.

```
GET https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen
```

This returns basic fields: `id`, `full_name`, `team_name`, `team_category`, `registration_category`, `city`, `country`, `event`, `event_id`, `has_waiver_applications_missing_signatures`, `associated_purchased_groups`, `question_answers`, `seed_mark`, `primary_affiliation`.

## Findings

### The public API is limited to one endpoint

The CCNBikes REST API (`/en/rest/v2/`) exposes 400+ endpoints, but nearly all require authentication. The only publicly accessible endpoint is `event_app/registration-search/`.

Attempts to add query parameters like `expand=true` or `fields=all` had no effect — the response is always the same set of fields.

### Authenticated endpoints that would have the data we want

| Endpoint                               | What it likely contains                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `registrations/{id}/`                  | Full registration details                                                                                   |
| `event_app/registrations/{id}/`        | Full registration details                                                                                   |
| `identities/?search=`                  | Personal details (address, emergency contacts)                                                              |
| `identity-attributes/`                 | Custom attribute definitions                                                                                |
| `identity-attribute-values/`           | Custom attribute values per identity                                                                        |
| `membership_app/identity-memberships/` | Membership history across years                                                                             |
| `memberships/`                         | Membership records                                                                                          |
| `membership_lookup/`                   | Membership search (tried with `organization_id=107371`, returned empty — may need different params or auth) |

All of these returned **401 Unauthorized**.

### Past membership events

Each membership year is a separate "event" in CCNBikes. The 2026 event ID is `21392` (organization ID `1654`). Past year events (2025, 2024, etc.) are not returned by the public events search — they appear to be archived or hidden from unauthenticated queries. We could search for members across past years if we had the event IDs, but finding them requires either authenticated access or manually checking old URLs.

### Organization details

- **Organization ID:** 1654 (Randonneurs Ontario)
- **Affiliation ID:** 107371 (used in `primary_affiliation` on registration records)
- The `event_app/organizations/1654/` endpoint also requires auth.

## Options for getting detailed data

1. **API key or token auth:** Check the CCNBikes org admin dashboard for API key generation. If available, the authenticated endpoints above would likely provide everything we need.

2. **Session-based auth:** Log into CCNBikes as an org admin, capture session cookies and CSRF token, and use those with the API. This is fragile (sessions expire) but would work for one-off data pulls.

3. **CSV export from admin UI:** CCNBikes org admins can typically export registration data with all fields from the dashboard. This is the simplest approach for periodic data pulls but doesn't support real-time lookups.

4. **Contact CCNBikes support:** Ask whether they offer org-level API credentials or OAuth tokens for programmatic access to member data.

## Recommendation

For our current use case (membership verification during registration), the public endpoint is sufficient. If we need address, emergency contact, or membership history, the most practical path is to contact CCNBikes about org-level API access or use CSV exports from the admin dashboard.
