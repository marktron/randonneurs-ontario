# RideWithGPS Collections

## Why collections exist

Most events map to a single RideWithGPS route. Events beyond 1200 km (Super
Randonnées, Paris-Brest-Paris-length rides, etc.) are split into multiple
legs, each with its own RWGPS route. A "collection" is RWGPS's grouping of
those per-leg routes, and `routes.rwgps_collection_id` lets a `routes` row
reference the collection instead of a single route.

Example collection: `https://ridewithgps.com/collections/8387874`.

## Data model

`routes` has two mutually exclusive reference columns:

- `rwgps_id` — a single RWGPS route (the existing, common case).
- `rwgps_collection_id` — a RWGPS collection of per-leg routes (added in
  `supabase/migrations/20260723120000_add_rwgps_collection_id.sql`).

The `routes_rwgps_ref_exclusive` CHECK constraint enforces that a route never
sets both:

```sql
CHECK (NOT (rwgps_id IS NOT NULL AND rwgps_collection_id IS NOT NULL))
```

This is unrelated to the `collection` text column on `routes`, which is a
series grouping label (e.g. "Granite Anvil") and has nothing to do with RWGPS.

## Admin entry

The route form (`components/admin/route-form.tsx`) has a single "Ride With
GPS Link" field. Admins paste whichever URL they have — a route URL
(`/routes/12345678`) or a collection URL (`/collections/12345`) — and
`extractRwgpsRefs()` (`lib/rwgps.ts`) detects the type and extracts the
numeric id:

- A `ridewithgps.com/collections/<id>` URL sets `rwgpsCollectionId` and
  leaves `rwgpsId` null.
- Anything else falls back to the existing route-parsing behaviour (bare
  numeric id, `/routes/`, `/ambassador_routes/`, or `/trips/` URLs).

The two ids are exactly mutually exclusive coming out of `extractRwgpsRefs`,
matching the DB constraint. The routes table shows "Collection `<id>`"
instead of a route id when `rwgps_collection_id` is set; the route form
instead pre-fills the URL input with the collection URL and shows a "View
current collection on RWGPS" link.

## Fetching collection data

`fetchRwgpsCollection(collectionId)` (`lib/rwgps.ts`) calls the authenticated
RWGPS v1 API (`GET /api/v1/collections/:id.json` with the
`x-rwgps-api-key` / `x-rwgps-auth-token` headers), unlike the plain route
JSON fetches used elsewhere, which are unauthenticated.

Behaviour:

- Cached for 1 hour via Next's `fetch` revalidation (`next: { revalidate:
3600 }`).
- The v1 API ignores the collection's custom sort order, so member routes
  are natural-sorted by name server-side, inside `fetchRwgpsCollection`
  (`"Leg 2"` before `"Leg 10"`, via `localeCompare` with `numeric: true`).
- Returns `null` — never throws — on missing `RWGPS_API_KEY`/
  `RWGPS_AUTH_TOKEN`, HTTP errors, network errors, a malformed body, or an
  empty collection. Callers treat `null` as "show a link instead of an
  embed."

## Event and calendar cards

`components/event-card.tsx` displays events on the calendar and event listing
pages. When an event's route is collection-backed (`rwgpsCollectionId` set),
the "Route" button links to the collection page via
`buildRwgpsCollectionUrl(rwgpsCollectionId)`. When `rwgpsId` is set instead
(single-leg routes), the button links to the individual route URL. The card
only shows the "Route" button when at least one RWGPS reference exists.

## Register page rendering

`app/register/[slug]/page.tsx` fetches the collection server-side when
`event.rwgpsCollectionId` is set, then renders `RwgpsCollectionEmbed`
(`components/rwgps-collection-embed.tsx`) if the fetch succeeded, or a plain
link to the collection page on RWGPS if it returned `null` (link-only
fallback).

`RwgpsCollectionEmbed` shows:

- A row of leg buttons (one per route in the collection, natural-sorted),
  each showing the leg name, rounded distance, and elevation gain. These are
  plain toggle buttons (`aria-pressed`, not an ARIA tabs pattern) — clicking
  one selects it.
- A single `RwgpsEmbed` iframe for the currently-selected leg. Only one
  embed is mounted at a time (collections can have 7+ legs and each embed is
  a heavy 500px iframe), keyed on the leg id so switching legs remounts the
  map.
- A "View full collection on Ride with GPS" link to the collection's
  `htmlUrl`.

This mirrors the single-route case (`event.rwgpsId` → `RwgpsEmbed` directly)
but is only reached when `rwgpsId` is null and `rwgpsCollectionId` is set —
the two are mutually exclusive per the DB constraint.

## Registration confirmation emails

`buildRouteUrl(rwgpsId, rwgpsCollectionId)` (`lib/actions/registration/helpers.ts`)
builds the "View on Ride with GPS" link included in registration
confirmation emails. It prefers the route URL when `rwgpsId` is set, falls
back to the collection URL (`buildRwgpsCollectionUrl`) for collection-backed
events, and omits the row entirely when neither id is present.

## Per-leg control cards

Collection-backed events import brevet-card controls per member route, via
the shared `CollectionLegImportDialog`
(`components/admin/collection-leg-import-dialog.tsx`) — available on **both**
the Event Controls manager (`components/admin/event-controls-manager.tsx`,
the digital brevet card page) and the Control Cards form
(`components/admin/control-cards-form.tsx`, the printed-card page). The
dialog fetches the legs with `fetchRwgpsCollection()` (natural-sorted), lets
the admin choose legs (all checked by default — uncheck combined/overview
routes), and imports each selected leg's controls with
`fetchRwgpsControlsWithCoords(legRouteId)`, tagged onto
`event_controls.leg_rwgps_id`/`leg_name` (the member route's name verbatim —
RWGPS names already carry the organizer's leg numbering). The import is
all-or-nothing: a leg that fails to fetch or has no parseable controls aborts
with a leg-specific error and nothing is written. The two callers differ in
what happens after import: the Event Controls manager populates the
(unsaved) row list for review before Save; the Control Cards form saves
immediately, since leg-event printing reads the saved `event_controls` rows.
A re-import preserves each surviving control's saved id (and its radius and
notes) rather than discarding it: imported and saved controls are grouped by
`leg_rwgps_id` and matched leg-by-leg with `matchImportedControls`, so the
resulting save updates rows in place instead of delete+reinserting them —
which would cascade-delete rider check-ins on the deleted rows. Matching
never crosses legs, since stored per-leg distances restart at 0 and two legs
can share a control name. Printing expands riders × legs (rider-major) with
cumulative event distances on the controls (`cumulativeLegDistanceKm` offsets
each leg by the previous legs' totals at display time) and no open/close
times; the digital card shows one leg-sectioned card with the same
cumulative distances. See `docs/control-cards.md` → "Collection routes
(per-leg cards)".

## Deployment requirement

`RWGPS_API_KEY` and `RWGPS_AUTH_TOKEN` must be set in the Vercel production
environment for collection embeds to render. Without them,
`fetchRwgpsCollection` logs a warning and returns `null`, and production
falls back to the plain collection link for every multi-leg event — the
page still works, it just won't show the per-leg map. See
`.env.local.example` for the variable names.
