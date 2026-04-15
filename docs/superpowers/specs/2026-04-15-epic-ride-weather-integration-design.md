# Epic Ride Weather Events Integration

Date: 2026-04-15

## Goal

Automatically sync Randonneurs Ontario brevet events to Epic Ride Weather (ERW) Events so riders get route-aware weather forecasts on dedicated ERW event pages. Link to these pages from the public registration page.

## Background

ERW launched an Events platform that lets endurance event organizers publish events with route-aware weather forecasts. The platform has a full CRUD REST API, a `brevet` tag, and RideWithGPS route auto-import. Our site already stores RWGPS route IDs and has ERW API credentials configured.

Announcement: https://www.epicrideweather.com/2026/03/11/epic-ride-weather-events/
API spec: https://events.epicrideweather.com/api/public/v1/openapi.json

## Approach

Inline sync in server actions (Approach A). ERW API calls happen after local DB operations succeed. ERW failures are logged to Sentry but never block local operations.

## Database

Add two nullable columns to `events`:

| Column              | Type   | Purpose                                          |
| ------------------- | ------ | ------------------------------------------------ |
| `erw_event_id`      | `TEXT` | ERW's event ID, used for PUT/DELETE API calls    |
| `erw_canonical_url` | `TEXT` | Full URL to the ERW event page, used for display |

Single migration. Both columns are nullable — events function normally without ERW.

## ERW API Client

New module: `lib/erw/client.ts`

### Authentication

- Exchange `EPIC_RIDE_WEATHER_CLIENT_ID` and `EPIC_RIDE_WEATHER_SECRET` for a JWT via `POST /auth/token`.
- Cache the token in a module-level variable (1-hour expiry, refresh proactively when near expiry).

### Functions

- `createErwEvent(event, rwgpsId?)` — `POST /events`. Sets `brevet` tag, event name, date, distance, description. If `rwgpsId` is provided, includes `sourceRouteUrl` as `https://ridewithgps.com/routes/{rwgpsId}` for auto-import. Returns `{ erwEventId, canonicalUrl }`.
- `updateErwEvent(erwEventId, event, rwgpsId?)` — `GET /events/{eventId}` to fetch the current `updated` timestamp, then `PUT /events/{eventId}` with that timestamp for optimistic locking. On 409 conflict, retry once with a fresh GET.
- `deleteErwEvent(erwEventId)` — `DELETE /events/{eventId}`.

### Field Mapping (RO → ERW)

| RO field              | ERW field                  | Notes                                      |
| --------------------- | -------------------------- | ------------------------------------------ |
| `name`                | `name`                     |                                            |
| `description`         | `description`              | Nullable                                   |
| —                     | `units`                    | Always `"intl"` (metric)                   |
| Registration page URL | `url`                      | Constructed from slug                      |
| Registration page URL | `registrationUrl`          | Same as `url`                              |
| —                     | `published`                | Always `true`                              |
| —                     | `tags`                     | Always `["brevet"]`                        |
| Route's `rwgps_id`    | `routes[0].sourceRouteUrl` | `https://ridewithgps.com/routes/{rwgpsId}` |

### Error Handling

- All functions return `{ success, data?, error? }`.
- Errors are logged via `logError()` from `lib/errors.ts`, which reports to Sentry automatically.
- Single retry on transient errors (5xx, network failures).
- Never throw — callers check `success` but local operations proceed regardless.

### Environment Variables

Add to `.env.local.example`:

```
EPIC_RIDE_WEATHER_CLIENT_ID=
EPIC_RIDE_WEATHER_SECRET=
```

## Server Action Integration

ERW sync hooks into three existing functions in `lib/actions/events.ts`:

### `createEvent()`

After the DB insert succeeds (skip for `permanent` event type):

1. Fetch the route's `rwgps_id` via the event's `route_id`.
2. Call `createErwEvent()` with event data and RWGPS ID.
3. If successful, update the event row with `erw_event_id` and `erw_canonical_url`.
4. If ERW fails, the event is created locally without ERW linkage (logged to Sentry).

### `updateEvent()`

If the event has an `erw_event_id`:

1. Call `updateErwEvent()` with updated data.
2. Update `erw_canonical_url` if the name changed (URL slug may differ).
3. If no `erw_event_id`, skip silently.

### `deleteEvent()` and `updateEventStatus()` to 'cancelled'

If the event has an `erw_event_id`:

1. Call `deleteErwEvent()`.
2. Clear both `erw_event_id` and `erw_canonical_url` on the event row.

## Registration Page Link

On `app/register/[slug]/page.tsx`, when `erw_canonical_url` is present, render a weather forecast link in the route section (alongside existing RWGPS embed / cue sheet links). Weather icon + "Weather forecast" text linking to the ERW page. If no `erw_canonical_url`, nothing renders.

The data query backing this page must include the `erw_canonical_url` column.

## Admin: Single Event Sync

Add a "Sync to ERW" button on the individual event admin page (`/admin/events/[id]`). This pushes the event to ERW (or updates it if already synced). Serves as both a manual trigger for first-time sync and a retry mechanism if ERW was down during creation.

## Admin: Bulk Sync

A server action `syncAllEventsToErw()` that:

1. Queries all events with `status = 'scheduled'` and no `erw_event_id`.
2. Creates them on ERW one by one, respecting rate limits (`Retry-After` headers).
3. Reports results: count of synced, count of failed, details of failures.

Triggered from the admin events page. Also useful as a "catch up" mechanism if ERW was down during a batch of event creations.

The single-event sync should be validated first before running the bulk sync.

## Testing

### ERW Client Unit Tests

- Auth: token exchange, caching, refresh on expiry.
- Create: successful creation, maps event fields correctly, includes `sourceRouteUrl` when `rwgpsId` present, omits it when absent.
- Update: sends correct payload, handles 409 conflict.
- Delete: successful deletion.
- Error cases: 401 (re-auth), 403 (unapproved client), 429 (rate limit), 5xx (retry), network failure.
- Sentry: verify `logError()` is called on failures.

### Server Action Integration Tests

- `createEvent`: ERW called after DB insert, `erw_event_id` and `erw_canonical_url` stored on success, event still created on ERW failure.
- `updateEvent`: ERW called when `erw_event_id` exists, skipped when absent.
- `deleteEvent`: ERW delete called when `erw_event_id` exists, columns cleared.
- `updateEventStatus` to cancelled: ERW delete called.

## Out of Scope

- Displaying weather data on the RO site (just linking to ERW for now).
- Syncing event results or rider data to ERW.
- Webhook-based sync (ERW doesn't offer inbound webhooks).
- Syncing permanent events (these don't have fixed dates).
