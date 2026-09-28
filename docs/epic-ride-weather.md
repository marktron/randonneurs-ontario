# Epic Ride Weather Integration

Every published brevet gets an event page on [Epic Ride Weather](https://events.epicrideweather.com) (ERW). ERW imports the event's RideWithGPS route and shows a route-aware forecast for the start date and time. The public registration page (`app/register/[slug]/page.tsx`) links to it as "Weather forecast".

The sync is one-way. We create, update and delete ERW events from server actions, and never read anything back except what the API returns to those calls.

- API: `https://events.epicrideweather.com/api/public/v1` ([OpenAPI spec](https://events.epicrideweather.com/api/public/v1/openapi.json))
- Client: `lib/erw/client.ts`
- Tests: `tests/unit/lib/erw/client.test.ts`, `tests/integration/actions/erw-sync.test.ts`

## Configuration

| Variable                      | Purpose                         |
| ----------------------------- | ------------------------------- |
| `EPIC_RIDE_WEATHER_CLIENT_ID` | OAuth client-credentials id     |
| `EPIC_RIDE_WEATHER_SECRET`    | OAuth client-credentials secret |

Sync only runs when `VERCEL_ENV === 'production'` (`lib/erw/config.ts`, `isErwSyncEnabled()`). Local dev and preview deploys skip every ERW call, so test events never reach the live ERW account. The admin sync button returns an error outside production.

The client exchanges the credentials for a bearer token at `POST /auth/token` and caches it in module memory until five minutes before it expires. A 401 clears the cache and retries once.

## Data

Two nullable columns on `events`:

| Column              | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `erw_event_id`      | ERW's event id. Used for every PUT and DELETE.       |
| `erw_canonical_url` | Public ERW page URL. Shown on the registration page. |

An event with `erw_event_id` set is "linked". Nothing else on our side refers to ERW.

## When sync happens

| Trigger                                  | Where                                        | ERW call                             |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------ |
| Event created with status `scheduled`    | `createEvent`                                | create                               |
| Draft published (`draft` to `scheduled`) | `updateEventStatus`                          | create                               |
| Season drafts published in bulk          | `publishSeasonDrafts`                        | create per event                     |
| Linked event edited                      | `updateEvent`                                | update                               |
| Linked event cancelled                   | `updateEventStatus`                          | delete, then clear both columns      |
| Linked event deleted                     | `deleteEvent`                                | delete                               |
| "Sync to ERW" / "Re-sync to ERW" button  | `syncEventToErw` (`lib/actions/erw-sync.ts`) | create if unlinked, otherwise update |

The create path for the first three triggers is `syncNewEventToErw` in `lib/events/erw-sync.ts`.

Rules that apply to all of them:

- Permanents are never synced.
- Drafts are never synced. The sync button refuses a draft, and the edit page hides the button until the event is published.
- ERW failures never fail the local operation. The event is saved, the error goes to Sentry via `logError`, and the admin can retry with the sync button. `publishSeasonDrafts` reports a count of ERW failures in its toast. `updateEvent` fails silently from the admin's point of view.
- The admin sync button is the only path that writes an audit log entry for the ERW call itself.

## What we send

`buildErwPayload` maps an event to the ERW payload:

| ERW field                | Value                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                   | Event name, with the distance appended unless it already ends with it (e.g. "Wiarton Willy 200")                                                                                                                  |
| `description`            | Event description, or a generic line if empty. Truncated to 2000 characters.                                                                                                                                      |
| `distance`               | `distance_km`                                                                                                                                                                                                     |
| `units`                  | `intl`                                                                                                                                                                                                            |
| `date`                   | `event_date`                                                                                                                                                                                                      |
| `published`              | `true` (see "Publishing and route import" below)                                                                                                                                                                  |
| `tags`                   | `['brevet']`                                                                                                                                                                                                      |
| `url`, `registrationUrl` | `https://www.randonneursontario.ca/register/{slug}`, always the production host                                                                                                                                   |
| `routes[0]`              | Only when the event's route has an `rwgps_id`: `sourceRouteUrl` of `https://ridewithgps.com/routes/{rwgps_id}`, `startDate` from the event date and start time (default 08:00), `averageSpeed` 5.56 m/s (20 km/h) |

Routes that point at an RWGPS collection (`rwgps_collection_id`, see [rwgps-collections.md](./rwgps-collections.md)) have no `rwgps_id`, so the ERW event gets no route.

## Publishing and route import

ERW imports a route from `sourceRouteUrl` asynchronously, and it rejects `published: true` for any route that has no path yet ("Route must have a GPX file or path for published events"). So any call that triggers an import sends the event as a draft first, then `publishErwEvent` polls: it waits 3s, 5s and 10s, and on each attempt re-reads the event and PUTs it back with `published: true`. A 400 means the import is still running and it tries again. If all three attempts fail, the event stays a draft on ERW and the timeout is logged to Sentry.

- **Create** always posts as a draft. If there is no route, it skips the publish loop because a routeless event can never pass validation. Those events stay drafts on ERW.
- **Update** only drafts-then-publishes when the outgoing route will be re-imported (see below). Otherwise it PUTs with `published: true` directly.

## Updating a linked event

`updateErwEvent` does a GET first, for two reasons:

1. **Optimistic locking.** ERW requires the current `updated` timestamp on every PUT. On a 409 conflict the client re-reads and retries once.
2. **Route identity.** A PUT replaces the whole `routes` array. Each ERW route has a `routeId`, and what we do with it decides what ERW does to the route:
   - **With the existing `routeId`:** ERW updates the route in place (name, start date, speed) and keeps its geometry. It ignores `sourceRouteUrl`.
   - **Without a `routeId`:** ERW deletes the route and re-imports it from `sourceRouteUrl`.

`mergeRouteIds` carries the existing `routeId` only when the existing route's `sourceRouteUrl` has the same RWGPS route id as the one we are sending (compared by the numeric id, so query strings like `?privacy_code=` don't matter). When the route has changed, it drops the `routeId`, ERW re-imports, and the update goes through the draft-then-publish loop above.

This matters because a route change is otherwise invisible to ERW. Before this rule, the `routeId` was always carried, so an event moved to a new RWGPS route kept the old route on ERW indefinitely, even after a re-sync (the Wiarton Willy 200, September 2026).

If the event has no RWGPS route to send (the route was unlinked, or it is a collection), `carryExistingRoutes` sends ERW's existing routes back with a refreshed start date, because omitting `routes` would clear them and ERW rejects a published event with no routes. If ERW has no routes either, the update is sent as a draft.

## Known gaps

- **Editing a route doesn't resync its events.** Changing a route's `rwgps_id` in the routes admin (`lib/actions/routes.ts`) updates the public site but makes no ERW call. Each linked event on that route needs an edit-and-save or a click on "Re-sync to ERW". Switching an event to a different route in the event editor does sync, because it goes through `updateEvent`.
- **Un-cancelling doesn't recreate the ERW event.** Cancelling deletes the ERW event and clears the columns. Setting the event back to `scheduled` does not create a new one; use the "Sync to ERW" button.
- **Collection routes get no forecast.** Multi-leg events have no single route to import.

## Operations

- **Re-sync one event:** the button on `/admin/events/[id]/edit`. It works only on the production deploy.
- **Bulk create for unlinked events:** `scripts/bulk-sync-erw.ts` finds future scheduled events that have an RWGPS route and no `erw_event_id`, creates their ERW events and writes the ids back. It calls the client directly, so the production gate doesn't apply; run it with production credentials (`npx tsx --env-file=.env.production.local scripts/bulk-sync-erw.ts --dry-run` first).
- **Checking what ERW has:** `GET /events/{erw_event_id}` with a bearer token returns the event, including each route's `routeId` and `sourceRouteUrl`. Compare `sourceRouteUrl` against the route's `rwgps_id` in our database when the forecast looks wrong.
