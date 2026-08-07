# Control Cards

Control cards are printed BRM brevet cards used by riders on events. Each card lists the control points along the route with opening/closing times calculated from ACP/BRM rules. The system generates print-ready letter-size pages with a front (regulations, rider/organizer info, QR codes) and a back (controls with time windows and signature boxes).

This document is aimed at developers maintaining or extending the feature. For end-user operational notes, see the [Operational notes](#operational-notes) section at the bottom.

## Entry points

There are **two separate flows** that share the print renderer and the BRM math, but have different purposes and data sources:

| Flow   | URL                                | Audience            | Data source                                                                                             |
| ------ | ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Public | `/control-cards`                   | Any rider/organizer | User fills in the form; routes come from `routes` table (active only).                                  |
| Admin  | `/admin/events/[id]/control-cards` | Logged-in admins    | Pre-populated from the event row + registered riders; organizer is pre-filled from the logged-in admin. |

Both flows follow the same two-step pattern:

1. A **form page** (server component) renders a **client form** that collects controls, organizer info, riders, etc.
2. Clicking "Generate Control Cards" opens a **print page** in a new tab. The form encodes its state as query params; the print page parses them, computes times, and renders the card sheets.

The print page is what actually triggers the browser print dialog via a "Print" button.

## Directory map

```
app/
  control-cards/                              # Public flow
    page.tsx                                  # Server: loads active routes, renders form
    print/
      page.tsx                                # Server: reads query params, computes times, renders <ControlCardsPrint>

  admin/events/[id]/control-cards/            # Admin flow
    page.tsx                                  # Server: loads event + registrations, renders form
    print/
      page.tsx                                # Server: reads event from DB + params, renders <ControlCardsPrint>
      layout.tsx                              # Minimal print-only layout (strips admin chrome)

components/
  control-card-form.tsx                       # Public flow's client form
  admin/
    control-cards-form.tsx                    # Admin flow's client form
    control-cards-print.tsx                   # Shared print renderer (used by both flows)
    collection-leg-import-dialog.tsx          # Leg-selection import dialog, shared by control-cards-form.tsx and event-controls-manager.tsx

lib/
  brmTimes.ts                                 # ACP/BRM opening/closing time math + Toronto TZ helpers
  controlPoints.ts                            # reverseControls() + isReversedEvent() for permanents
  rwgps.ts                                    # Shared RWGPS fetch + parse + dedupe (used by both forms)
  geo.ts                                      # haversineMeters() for POI distance interpolation

types/
  control-card.ts                             # Shared types + regulations/preamble text constants
```

Note the slight misnomer: `components/admin/control-cards-print.tsx` is used by **both** the admin and public flows. It lives under `admin/` for historical reasons.

## Data flow

Both flows are structurally the same. The form collects state locally and encodes it into a URL. The print page is a pure function of those URL params (plus, in the admin flow, the event row).

```
┌──────────────────────┐     query params      ┌──────────────────────┐
│  Form (client)       │ ────────────────────▶ │  Print page (server) │
│  - controls[]        │                       │  - parse params       │
│  - organizer         │                       │  - fetch event (admin │
│  - extraBlank        │                       │    only)              │
│  - riders (public)   │                       │  - computeControl-    │
└──────────────────────┘                       │    Times() per control│
                                               │  - render cards       │
                                               └──────────────────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │ <ControlCardsPrint>  │
                                               │ 2 riders per sheet,  │
                                               │ front + back pages   │
                                               └──────────────────────┘
```

### Public flow params (`/control-cards/print`)

The public flow has no server-side state, so **everything** is encoded in the URL:

- `routeName`, `distance`, `chapter`
- `eventDate` (`YYYY-MM-DD`), `startTime` (`HH:MM`)
- `organizerName`, `organizerPhone`, `organizerEmail`
- `controls` — JSON-encoded `{ name, distance }[]`
- `riders` — JSON-encoded `{ firstName, lastName }[]`
- `extraBlank` — integer count of extra blank cards
- `rwgpsUrl` — optional, used for the Route Map QR code

### Admin flow params (`/admin/events/[id]/control-cards/print`)

The admin flow looks up the event from the DB, so fewer params are needed:

- `organizerName`, `organizerPhone`, `organizerEmail`
- `controls` — JSON-encoded `{ name, distance }[]`
- `extraBlank` — integer count

The event name, date, start time, start location, chapter, distance, and RWGPS ID all come from the `events` + `routes` + `chapters` join. Riders come from `registrations` where `status = 'registered'`, including each registration's `management_token` (used to build the result submission QR code).

#### Which name titles the card

`CardEvent.routeName` — the big serif headline on the card front and the middle column header on the back — is **`events.name`**, not `routes.name`. A linked route's name carries RideWithGPS-side edits, version suffixes and distance labels, and one route is often shared by several events, so it drifts from the name riders saw when they registered. The linked route is still used for what it genuinely owns: the `rwgps_id` behind the **Route Map** QR code.

The single exception is a **collection event**, where each printed card covers one leg. `eventFor(leg)` in `ControlCardsPrint` substitutes the leg's name and per-leg distance for that card. See `tests/unit/app/admin-control-cards-print-page.test.tsx`.

The public flow (`/control-cards`) has no event record, so it keeps taking `routeName` from the selected route via the query param.

#### Not restating the distance

The card appends `{distance} km` to the title in two places — the front's distance/date line and the back's middle column header. Event names usually carry the distance already, so appending unconditionally reads as "Ottawa 200 200 km". `titleStatesDistance(title, distanceKm)` in `lib/controlPoints.ts` suppresses the append when the title already ends with that distance.

It is deliberately strict, matching only a **trailing number equal to the distance**. Randonneuring names are nominal while the measured route is longer — "Ottawa 200" at 203.4 km, "PBP 1200" at 1219 km — and those cards must still print the real distance. A number anywhere but the end ("200 Loop of Ottawa") is not a restatement either. Collection leg cards are unaffected: leg names carry no distance, so "Leg 1: Gravenhurst 205.3 km" still prints in full.

## BRM time calculation (`lib/brmTimes.ts`)

This is the only piece of real domain logic. It implements ACP/BRM control opening and closing rules and should be changed with care — the tests in `tests/unit/lib/brmTimes.test.ts` encode the expected behavior.

### Nominal distances

`getNominalDistance(distance)` rounds up to one of: `200 | 300 | 400 | 600 | 1000 | 1200 | 1300`. This is what `NominalDistance` means everywhere else — the official BRM category, not the measured route length.

### Opening times

Piecewise speed by segment (km/h):

| Distance band | Speed |
| ------------- | ----- |
| 0–200 km      | 34    |
| 200–400 km    | 32    |
| 400–600 km    | 30    |
| 600–1000 km   | 28    |
| 1000–1300 km  | 26    |

### Closing times

- 0 km (start): always 1 hour.
- 0–600 km: 15 km/h.
- 600–1000 km: 11.428 km/h.
- 1000–1300 km: 13.333 km/h.

### Finish clamping

The finish control's close time is **not** calculated from the banded formula above — it's clamped to the official BRM overall time limit:

| Nominal | Overall limit |
| ------- | ------------- |
| 200     | 13h 30m       |
| 300     | 20h           |
| 400     | 27h           |
| 600     | 40h           |
| 1000    | 75h           |
| 1200    | 90h           |
| 1300    | 108h 20m      |

Finish detection uses the **route length** (actual km if provided, else nominal), but the overall limit comes from the **nominal** distance. This is intentional: a 208 km route is still a BRM 200 with the 13h30m limit.

### Timezone

All card times are in **America/Toronto**. `createTorontoDate(year, month, day, hour, minute)` constructs a `Date` whose Toronto-local time matches the intended values, regardless of the server's timezone. `formatControlTime(date)` and `formatCardDate(date)` both format via `Intl.DateTimeFormat` with `timeZone: 'America/Toronto'`. If you touch any of this, verify behavior on a non-Toronto server — it's easy to introduce a bug that works locally but not in production.

### Truncation

By default `computeControlTimes` truncates distances to whole km before computing times. This matches ACP's rounding convention.

## Print layout (`components/admin/control-cards-print.tsx`)

- **Letter portrait**, 2 cards per sheet (front on page 1, back on page 2 — designed for double-sided printing).
- Front: regulations (left), time/signature fields (middle), event + rider + organizer + QR codes (right).
- Back: up to 24 controls in 3 columns. Rows per column and typography scale with the control count via `backCardLayout()` in `lib/controlPoints.ts`: `normal` ≤12 controls (4 rows/col, full-size text), `compact` 13–18 (5–6 rows/col), `dense` 19–21 (7 rows/col), `ultra` 22–24 (8 rows/col). The ultra tier renders open/close times on one line (like `Sat 17:14 - Sun 21:36`) and merges the Time and Signature columns into a single **Validation** column at 1/3 of the width, doubling the name cell so long control names (services in brackets, etc.) wrap instead of overflowing. Beyond `MAX_CARD_CONTROLS` (24) the print page renders an error panel instead of cards — there is no truncation path. Both forms disable Generate above the cap with an inline error.

#### Row sizing and long control names

Three rules in `control-cards-print.css` keep a long control name from breaking the back page. They were added after "Charbonneaus Grocery", "White Lake General Store" and "Athens Fresh Market" wrapped to two lines on a 19-control card and pushed their close times through the row's bottom border into the next control.

- **`.control-row` uses `flex: 1 1 auto`**, not `flex: 1 1 0`. With a `0` basis every row gets an identical share of column height regardless of content, so a row with a wrapped name overflows while single-line rows keep unused space. With an `auto` basis rows size from content and `flex-grow: 1` still spreads the leftover height, so a tall row borrows slack from its neighbours. This is the load-bearing fix and applies at every tier (it was previously scoped to `ultra` only).
- **The grid is `1.2fr 0.55in 0.8fr`**, not `1fr 0.6in 0.85fr`. The old split left the name cell at ~0.96in, narrow enough that ordinary two-word names wrapped; ~1.09in fits most of them on one line while keeping the Time cell wide enough for `16:15`.
- **`.control-name` sets `overflow-wrap: anywhere`.** An `fr` track has an automatic `min-content` floor, so a name with no spaces to break at widens the name track and squeezes the Time and Signature cells. `anywhere` is required rather than `break-word` — only `anywhere` lowers the intrinsic `min-content` width that the floor is measured from.

Capacity is still finite: at 7 rows per column there is roughly 4.6in of row space against ~4.3in of single-line content, so about two wrapped names per column fit comfortably. A column where nearly every name wraps would still run past the card edge, and the durable answer there is dropping a tier earlier in `backCardLayout()` rather than more CSS.

- Print styles live in a static stylesheet at `components/admin/control-cards-print.css`, imported by both print layouts so they end up in `<head>` at parse time. `@page { size: letter portrait; margin: 0 }` plus aggressive overrides to hide any ancestor `nav`, `aside`, `header`, or sidebar (important for the admin flow, where the print page still inherits the admin chrome in the component tree). The chrome-hiding rules are also applied in screen media so the print page reads as a clean preview whether visited directly or via the autoprint popup.
- Fonts (`Noto Sans` + `Noto Serif`) come from `next/font/google` at the root layout, exposed as `var(--font-sans)` and `var(--font-serif)`. The print stylesheet references those CSS variables.
- Everything in `.no-print` is hidden during print.

### Safari print workaround (`autoprint=1`)

Calling `window.print()` directly on this page in Safari triggers a WebKit bug: the document is replaced by an empty "Untitled" state and the printer receives blank pages. Chrome and other browsers are unaffected. This was investigated thoroughly — the page's print snapshot has provably-correct layout, the issue lives below React's awareness (no events fire, document is replaced), and it reproduces in Safari Private mode (rules out extensions) and production builds (rules out HMR / dev runtime).

To work around it, the **Print Control Cards** button in `ControlCardsPrint` (`components/admin/control-cards-print.tsx`) opens the same URL in a fresh `window.open()` with `?autoprint=1` appended. The component's `useAutoPrintIfRequested` hook detects that flag, awaits `document.fonts.ready`, calls `window.print()` from the new window's clean document context, and closes the window on `afterprint`. If `window.open` returns `null` (popup blocked) the handler falls back to direct `window.print()`.

### QR codes

Rendered with `qrcode.react`. Up to two QR codes appear in the bottom of the middle column of the front:

- **Route Map** — links to `https://ridewithgps.com/routes/{rwgps_id}`. Only included if the event's linked route has an `rwgps_id`.
- **Submit Your Results** — links to `/registration/manage/{management_token}`. Admin flow only; requires the registration to have a `management_token`. Size is reduced when both QR codes are present. The manage page redirects to `/results/submit/{token}` once the event has started, calling `createEarlyResult` to mint the pending result row on demand if the event hasn't been switched to "completed" yet (see `docs/registration-management.md`).

Above those, a grayscale **"New! Try out the digital brevet card"** banner with its own QR (linking to `/card/{management_token}`) appears when the digital card would actually be usable — the admin print page mirrors the `/card/[token]` availability check (`CardRider.cardUrl` is set only when the event type passes `isDigitalCardEventType`, the event has stored `event_controls` rows, and the registration has a `management_token`), so the printed QR never lands on the "not set up" page. The public `/control-cards/print` flow has no registration tokens and never shows the banner.

## Reversed permanent routes

Permanents can be ridden in reverse. The `events.name` convention is to append `(Reversed)` to the route name. The admin control-cards form detects this via `isReversedEvent(name)` and:

1. Swaps the default Start/Finish labels in the initial 2-control list.
2. Reverses imported controls. The public form uses `reverseControls(controls, totalDistance)` directly. The **admin** form now imports via the `importEventControlsFromRwgps(eventId)` server action, which applies the reversal server-side (using the event's `distance_km`) — see "RWGPS import" below.
3. Shows an info banner in the form. Combined with custom start locations on permanents, the banner has three variants (see `components/admin/control-cards-form.tsx`):
   - Reversed + custom start: "Controls are shown in reversed direction, starting from {location}."
   - Reversed only: "Controls are shown in reversed direction."
   - Custom start only: "Starting from {location}."

The public form does **not** implement reversal — that flow has no concept of a permanent event, so if you're printing cards for a reversed permanent you should use the admin flow (or reverse them manually in the form).

Logic lives in `lib/controlPoints.ts`, covered by `tests/unit/lib/controlPoints.test.ts`.

## Collection routes (per-leg cards)

Events whose route has `rwgps_collection_id` (no `rwgps_id`) print **one card
per rider per collection member route ("leg")** instead of one card per rider.

- Controls are stored per leg in `event_controls` via the nullable pair
  `leg_rwgps_id` + `leg_name` (set together or not at all —
  `event_controls_leg_pair` CHECK). `position` still orders controls globally
  across legs. Single-route events leave both NULL — zero behavior change.
  `saveEventControls` also rejects a control list that mixes leg-tagged and
  untagged rows within one event, before any write: `groupControlsByLeg` /
  `buildCardLegsFromRows` are all-or-nothing, so a saved mix would silently
  fall back to the single-route BRM-time path with wrong per-leg windows.
  "All tagged or none" is therefore an enforced write-time invariant, not
  just a read-time convention.
- Import is available from both admin pages via the shared
  `CollectionLegImportDialog` (`components/admin/collection-leg-import-dialog.tsx`):
  the Import button opens a leg-selection dialog (`getEventCollectionLegs`,
  all legs checked by default, natural-sorted) and
  `importEventControlsFromRwgpsCollection` fetches every selected leg's
  controls all-or-nothing, tagging rows with the member route's name verbatim
  as `leg_name`. `saveEventControls` assigns positions leg-major (leg
  first-appearance order, distance within a leg).
  - In the Event Controls manager (`components/admin/event-controls-manager.tsx`),
    an import replaces the (unsaved) row list for review — the admin still
    clicks Save.
  - In the Control Cards form (`components/admin/control-cards-form.tsx`), an
    import replaces the row list **and saves immediately** (same persistence
    path as the single-route mount auto-import, `importFromRwgps({ autoSave:
true })`) — leg-event printing reads the saved `event_controls` rows, so
    an unsaved import would print nothing. The save is skipped when the event
    is submitted (controls are frozen).
- The admin print form (`components/admin/control-cards-form.tsx`) shows the
  card count as riders × legs and applies `MAX_CARD_CONTROLS` **per leg** (the
  error names the offending leg). For leg-grouped controls it **omits the
  `controls` query param entirely** — a full leg control list blows past
  platform request-line limits (~14 KB on Vercel) — and the admin print page
  instead reads the stored `event_controls` rows and builds its `CardLeg[]`
  via `buildCardLegsFromRows` (`lib/controlPoints.ts`). Because of that,
  unsaved form edits never affect leg printing; the drift warning says so.
  For the same reason, the Generate button is disabled for leg events
  whenever the form drifts from the saved snapshot (`controlsInSync` is
  false) — clicking it while a save is pending or failed would otherwise
  open a print page reading stale or blank controls. Single-route events are
  unaffected by this gate: their print URL carries the controls directly, so
  they stay current regardless of the saved snapshot.
  Single-route events keep the legacy `controls` param flow unchanged.
  `groupControlsByLeg` / `expandRiderLegCards` (`lib/controlPoints.ts`) drive
  grouping and rider-major expansion.
- Leg card front: leg name as the route name, per-leg distance (the leg's
  last control distance), Route Map QR pointing at the leg's RWGPS route.
  Event name/date/start info, organizer, Total Allowable Time (overall event
  limit) and Submit Results QR are the same on every leg card.
- Leg card back: that leg's controls with per-leg distances and **no
  open/close times** (`ControlPoint.openTime`/`closeTime` are optional and
  omitted; `CardBack` skips the times block). Layout tiers apply per leg.
- The DB is the source of truth at print time: cards keep printing from
  stored leg rows even if the route later loses its collection reference.
- Collection events can import controls directly on the Control Cards form
  (via the shared leg-selection dialog above) or on the Digital Brevet Card
  page. If a collection event has no saved `event_controls` yet, the form
  also shows a hint pointing at `/admin/events/[id]/brevet-card` as an
  alternative (the generic "No RWGPS route linked" hint is single-route-only
  and does not apply). Once leg-grouped controls exist, no hint shows.
- Leg heading rows: the editable control list on the Control Cards form
  renders a muted, non-editable heading row (`legName`) before the first
  control of each leg — same boundary rule as the digital-card manager's
  table (heading whenever a row's `legName` differs from the previous row's).
  Single-route lists (every `legName` null) render no headings.
- The public `/control-cards` flow is single-route only and untouched.
- The digital brevet card stays **one card per event**, sectioned by leg:
  the payload carries `legName` per control and
  `components/brevet-card-view.tsx` renders a heading at each leg boundary.
  Check-in/start/completion logic is untouched.
- Like the printed leg cards, **leg-tagged controls carry no per-control
  window** anywhere digital: per-leg distances restart at 0, so a window
  computed from the event start would be wrong for legs 2+. The card payload
  sends `opensAt`/`closesAt` as null (`CardControl` in
  `lib/actions/brevet-card.ts`), the rider card renders no times line,
  `deriveCheckinFlags` never derives `early`/`late` for a null window, and
  the admin check-ins grid omits `windowLabel` for leg rows. The overall
  event limit governs.

## RWGPS import

Both forms auto-import controls when the route has an `rwgps_id`, on mount (public form: when the user selects a route; admin form: on initial mount **only when the event has no saved `event_controls`** — otherwise it prefills from those, see below). When the admin form auto-imports on mount, it also **auto-saves** the imported rows back to `event_controls` (via the same save flow as the manual button), so an unconfigured event lands in sync with the digital brevet card without a click — a distinct toast ("Controls imported from RWGPS and saved to this event") confirms it. The auto-save is skipped when the event is submitted (controls are frozen — the import still runs so the printed card is populated), and a run-once ref guard keeps React strict-mode's double-invoked mount effect from importing or saving twice. A **manual** "Import from RWGPS" click never auto-saves; it only repopulates the rows and lets the drift affordances persist them. All fetching, parsing, and dedupe logic lives in `lib/rwgps.ts`.

All route fetching goes through the **authenticated v1 API** (`https://ridewithgps.com/api/v1/routes/{id}.json`, with the `x-rwgps-api-key` and `x-rwgps-auth-token` headers from `RWGPS_API_KEY` / `RWGPS_AUTH_TOKEN`). Only the v1 response carries each POI's `distances` array, which is what makes multi-pass controls work (see below); the public `ridewithgps.com/routes/{id}.json` endpoint does not. Because the credentials must stay server-side, the public form's fetches run through the thin server actions in `lib/actions/rwgps.ts` (`loadRwgpsControls`, `loadRwgpsRoute`) rather than from the browser. Those actions return `ActionResult` rather than throwing, since Next.js masks thrown server-action messages in production.

The two forms differ in **how** they fetch:

- **Public form** calls the `loadRwgpsControls(rwgpsId)` / `loadRwgpsRoute(rwgpsId, privacyCode)` server actions and applies `reverseControls()` itself when needed. It strips coordinates.
- **Admin form** calls the `importEventControlsFromRwgps(eventId)` **server action**, which fetches with coordinates (`fetchRwgpsControlsWithCoords`) and applies reversed-event handling server-side. This is the same importer the digital brevet card manager uses, so both produce identical results. Coordinates are kept internally (for save-back to `event_controls`) but never encoded into the print URL.

### Shared controls with the digital brevet card

The admin control-cards form treats the saved `event_controls` rows as the single source of truth: it prefills from them, and offers save / update / reset affordances to write back. See `docs/digital-brevet-card.md` §16 for the full description, and `lib/controlPoints.ts` (`matchImportedControls`, `controlsInSync`) for the pure helpers.

### Two encodings

Controls can be encoded two ways in RWGPS, and some routes use both. Both are imported:

1. **Course points** (`course_points[]` with `t === 'Control'`): carry an authoritative distance `cp.d` (meters from start). In GPX these are the per-waypoint cue-sheet entries.
2. **Waypoints / POIs** (`points_of_interest[]` with `type` in `control`, `start`, or `finish`): carry `lat`/`lng` plus a `distances[]` array (meters from the route start, one entry per pass). In GPX these are the top-level `<wpt>` entries with `<cmt>control</cmt>`. `start` and `finish` are included because the start and finish are always controls on a BRM route, and some organizers only mark the endpoints (not the intermediate controls) as POIs. Note the v1 field names: `type` (`control`) and `type_name` (`Control`), not the public endpoint's `poi_type`/`poi_type_name`.

### POI distances and multiple passes

Routes can pass the same physical control more than once (loops, out-and-backs, hub-and-spoke designs — the Waffle 1200 passes Chatham five times). The v1 API reports every pass in the POI's `distances` array, e.g. Chatham on route 53737237 comes back as `[0, 355812.8, 714587.1, 1009806.9, 1214016.7]`, so `lib/rwgps.ts` sorts the array and emits one control per entry — no track-point scanning involved.

- A `control`-type POI becomes one control per entry in `distances`.
- A `start`-type POI keeps only the **first** distance and a `finish`-type POI only the **last**: on loop routes the same spot is passed at km 0 and km total (and sometimes mid-ride), but an endpoint label marks exactly one visit.

A POI with an empty or missing `distances` array is skipped: RWGPS reports no distances for POIs that aren't placed on the route (non-control POIs such as restrooms also come back with an empty array, though those are filtered by `type` anyway).

RWGPS reports a pass wherever the route physically goes by the POI, so a route that merely rides past a control's location without stopping still yields an extra row. The organizer deletes such rows while reviewing the import; the import matcher always attaches the saved row — with its check-ins — to the closest same-name pass, so the extra row is the unsaved one.

### Dedupe

Two passes:

1. **Physical pre-dedupe**: if two POIs share a `type` and are within **200 m** of each other by lat/lng, collapse to one. This targets the common pattern of a bare label POI (`Start: Waterloo`) co-existing with an explicit control POI (`CONTROL Start A&W, Waterloo`) at the same parking lot. Tie-breaker: prefer the entry whose name carries an explicit `CONTROL`/`CTL`/`CTRL` prefix, since that signals organizer intent.

2. **Route-distance dedupe**: any two controls within **100 m** of each other along the route collapse to one. Precedence is `control`-type POI > `start`/`finish`-type POI > course point, because organizer-curated POI names are typically more descriptive than the short course instruction text. Distance-along-route is the right metric here — it naturally handles loop routes where a legitimate `start` and `finish` sit at the same physical place but should remain distinct controls at km 0 and km N.

### Name cleanup

Common prefixes on control names are stripped from both sources: `CTL - `, `CTL-`, `CTL `, `CTRL - `, `CTRL-`, `CTRL `, `CONTROL - `, `CONTROL-`, `CONTROL `, and a leading `-`/`- `. This keeps organizer-friendly names like `CTL - Little Lake` from cluttering the printed card. Lives in `cleanControlName()` in `lib/rwgps.ts`.

### Errors

`fetchRwgpsControls` / `fetchRwgpsRoute` throw with a user-facing message when the API credentials are missing, when the HTTP request fails, or when neither source yields any control. The `lib/actions/rwgps.ts` server actions convert those messages into `{ success: false, error }`; the forms surface the message inline.

Manual entry is always available regardless of RWGPS import.

## Riders and blank cards

- **Admin flow**: riders are the event's registered riders (with management tokens). Extra blank cards can be added for day-of registrations via the `extraBlank` input. If no registrations exist and no extras are requested, the form prints **2 blank cards** by default.
- **Public flow**: riders are entered by name in the form. Blank-card default is **1** if no riders or extras.

The print renderer pairs riders 2-per-sheet (`riderPairs`). A `null` is inserted for an unpaired final rider so the layout stays consistent.

### First-time rider indicator

In the **admin flow**, the print page calls `getFirstTimeRiderIds()` (`lib/data/first-time-riders.ts`) for the registered rider IDs and sets `isFirstTimeRider` on each `CardRider`. When set, `<ControlCardsPrint>` prepends `★ ` to the vertical rider name on the front of the card so organizers can spot newcomers at a glance. The same helper backs the "First event" badge on the admin event detail page, so both surfaces agree.

The public flow does **not** show the indicator: rider entries on `/control-cards/print` are freeform names with no rider ID, so there's no reliable way to look up history.

## Types (`types/control-card.ts`)

| Type               | Purpose                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `ControlPoint`     | A single control after time computation (has `openTime`/`closeTime` strings).         |
| `CardRider`        | Rider on a card; optional `submissionUrl` for the results QR.                         |
| `OrganizerInfo`    | Name/phone/email displayed on the front.                                              |
| `CardEvent`        | Event metadata for the card renderer.                                                 |
| `ControlCardData`  | Full bundle (used as a contract type, not directly instantiated by the current code). |
| `ControlCardInput` | Form-side input shape.                                                                |

Two constants also live here:

- `REGULATIONS_TEXT` — the boilerplate paragraphs printed on the front-left column.
- `EVENT_INFO_TEXT` — the "Event Organized Under..." preamble and the emergency-services line.

If you need to change regulation wording, edit it here — `<ControlCardsPrint>` imports these directly.

## Tests

Unit tests cover the pure modules:

- `tests/unit/lib/brmTimes.test.ts` — opening/closing formulas, nominal bands, finish clamping, Toronto TZ.
- `tests/unit/lib/controlPoints.test.ts` — `reverseControls` and `isReversedEvent`.
- `tests/unit/lib/rwgps.test.ts` — `cleanControlName`, `extractControls` (source merging, dedupe, POI interpolation, off-route rejection), and `fetchRwgpsControls` (mocked `fetch`).
- `tests/unit/lib/geo.test.ts` — `haversineMeters` sanity checks.

Component tests cover the rendered DOM:

- `tests/unit/components/control-cards-print.test.tsx` — first-time rider indicator, collection-leg expansion, `MAX_CARD_CONTROLS` error panel.

Back-page **geometry** is covered by a real browser, because jsdom and happy-dom have no layout engine and cannot see a row overflow its border:

- `tests/e2e/control-card-print-layout.spec.ts` — asserts no control row overflows its own box, no two rows overlap, no row extends past the card edge, and that a long unbreakable name does not squeeze the Time/Signature cells. Run with `npm run test:e2e:print-layout`.

That spec uses its own `playwright.config.print-layout.ts` rather than the main Playwright config: `/control-cards/print` is entirely query-param driven and sits outside the `/admin/*` proxy matcher, so it needs no seeded database and should not pull in `tests/e2e/global-setup.ts`. It runs in CI as the `print-layout` job. (The main `tests/e2e` suite is not currently wired into CI, and its `global-setup.ts` cannot run on Node 20 — supabase-js realtime requires a native `WebSocket`.)

If you change the print layout, run that spec and also eyeball a real print preview; if you change BRM math or RWGPS parsing, update the unit tests red-then-green.

## Common extension points

- **New nominal distance (e.g., 1500 km)**: add to `NominalDistance`, `FINISH_LIMITS_MIN`, `OPEN_SEGMENTS`, `closeHours`, and `getNominalDistance` in `lib/brmTimes.ts`. Add corresponding test cases.
- **New field on the card**: add to `CardEvent`/`CardRider`/`OrganizerInfo` in `types/control-card.ts`, thread it through both print pages (`app/control-cards/print/page.tsx` and `app/admin/events/[id]/control-cards/print/page.tsx`), and render it in `components/admin/control-cards-print.tsx`.
- **New QR code**: add URL construction in the print page(s), add a prop to `<ControlCardsPrint>`, render a third `QRCodeSVG` and adjust the sizing/layout in `CardFront`.
- **Regulation text change**: edit `REGULATIONS_TEXT` in `types/control-card.ts`. The renderer splits each entry on its first colon to bold the label.

## Operational notes

_(These are the end-user-facing notes from the previous version of this doc. Retained here so the admin workflow isn't undocumented.)_

### Generating control cards

Navigate to **Admin > Events > [Event] > Paper Cards**.

Control points can be added in two ways:

1. **Manual entry** — add controls one by one with name and distance (km).
2. **Import from RWGPS** — if the event has a linked RideWithGPS route, click "Import from RWGPS" to pull in controls automatically. Controls must be marked with type "Control" as course points in the RWGPS route editor.

### Control count limit

Printed cards hold at most **24 controls** (3 columns × 8 rows). Cards with 13+
controls automatically switch to progressively more compact row layouts to fit;
at 22–24 the open/close times collapse to one line and the separate Time and
Signature boxes become a single **Validation** box (volunteers write the time
and sign in the same cell). If an event has more than 24, the Generate button
is disabled with an inline error — merge adjacent controls or remove
non-mandatory ones in the form. (The digital brevet card has no such limit;
this cap is purely about paper space.)

### Rider selection

On the admin page, "Print cards for" offers two options: **All registered riders** (default) and **Choose individually**. Selecting "Choose individually" reveals a checklist of registered riders, all checked by default. Uncheck riders to exclude them, or use "Select all" to clear or restore all selections. The Generate button displays a live count of cards that will print (selected riders plus any extra blank cards). Behind the scenes, selected rider IDs are passed to the print page as a `riderIds` query parameter. With no explicit selection, every registered rider receives a card, so existing links remain unaffected.

### Validating draft routes from RideWithGPS

Route designers can validate a draft route by visiting `/control-cards?rwgps=true`. The picker is replaced with a RideWithGPS URL input; pasting any route URL (or bare ID) and clicking Load fetches the route's name, distance, and control points live from RideWithGPS — nothing is saved. All form fields remain editable, and the Generate button produces the same printable cards as the regular flow.

Private routes work too — paste the share link URL (which includes `?privacy_code=...`) and the privacy code is forwarded to RWGPS automatically.

### Reversed permanents

When a permanent is registered as reversed, the event name includes "(Reversed)". Controls are automatically reversed and distances recalculated. An info banner in the form tells you when this is happening. Example:

| Original      | Distance | Reversed      | Distance |
| ------------- | -------- | ------------- | -------- |
| Start         | 0.0 km   | Finish        | 0.0 km   |
| Georgetown    | 45.2 km  | Campbellville | 62.2 km  |
| Little Lake   | 97.7 km  | Little Lake   | 106.8 km |
| Campbellville | 142.3 km | Georgetown    | 159.3 km |
| Finish        | 204.5 km | Start         | 204.5 km |

### Route Map and Submission QR codes

If the event's route has an `rwgps_id`, a Route Map QR code is printed on the front of each card. In the admin flow, if the rider's registration has a `management_token`, a "Submit Your Results" QR code is also printed, linking to `/registration/manage/{token}`. Once the event has started, that page automatically forwards the rider to the result submission form — including the case where a fast finisher submits before the event has been marked "completed".

### Organizer details

Pre-filled from the logged-in admin's profile (name, phone, email) in the admin flow. Editable in the form.

### Extra blank cards

Use the "Extra blank cards" field to print additional unassigned cards for day-of registrations.
