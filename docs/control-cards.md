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
- Back: up to 12 controls arranged in 3 columns of 4, with open/close times and signature cells.
- Print styles live in a `<style jsx global>` block inside the component. `@page { size: letter portrait; margin: 0 }` plus aggressive overrides to hide any ancestor `nav`, `aside`, `header`, or sidebar (important for the admin flow, where the print page still inherits the admin chrome in the component tree).
- Fonts (`Noto Sans` + `Noto Serif`) are loaded inline via a `<link rel="stylesheet">` in the component. The ESLint rule `@next/next/no-page-custom-font` is suppressed here because this is a print-only surface outside normal layout rules.
- The "Print Control Cards" button calls `window.print()`. Everything in `.no-print` is hidden during print.

### QR codes

Rendered with `qrcode.react`. Up to two QR codes appear in the bottom of the middle column of the front:

- **Route Map** — links to `https://ridewithgps.com/routes/{rwgps_id}`. Only included if the event's linked route has an `rwgps_id`.
- **Submit Your Results** — links to `/registration/manage/{management_token}`. Admin flow only; requires the registration to have a `management_token`. Size is reduced when both QR codes are present. The manage page redirects to `/results/submit/{token}` once the event has started, calling `createEarlyResult` to mint the pending result row on demand if the event hasn't been switched to "completed" yet (see `docs/registration-management.md`).

## Reversed permanent routes

Permanents can be ridden in reverse. The `events.name` convention is to append `(Reversed)` to the route name. The admin control-cards form detects this via `isReversedEvent(name)` and:

1. Swaps the default Start/Finish labels in the initial 2-control list.
2. After RWGPS import, passes the imported controls through `reverseControls(controls, totalDistance)`, which reverses the order and recalculates each distance as `totalDistance - originalDistance`.
3. Shows an info banner in the form. Combined with custom start locations on permanents, the banner has three variants (see `components/admin/control-cards-form.tsx` lines ~309–320):
   - Reversed + custom start: "Controls are shown in reversed direction, starting from {location}."
   - Reversed only: "Controls are shown in reversed direction."
   - Custom start only: "Starting from {location}."

The public form does **not** implement reversal — that flow has no concept of a permanent event, so if you're printing cards for a reversed permanent you should use the admin flow (or reverse them manually in the form).

Logic lives in `lib/controlPoints.ts`, covered by `tests/unit/lib/controlPoints.test.ts`.

## RWGPS import

Both forms auto-import controls when the route has an `rwgps_id`. This happens on mount (public form: when the user selects a route; admin form: on initial mount if the event's route has one). All fetching, parsing, and dedupe logic lives in `lib/rwgps.ts` — both forms call `fetchRwgpsControls(rwgpsId)` and differ only in downstream handling (the admin form additionally feeds the result through `reverseControls()` for reversed permanents).

The fetch is **client-side** against `https://ridewithgps.com/routes/{id}.json`. RWGPS accepts unauthenticated JSON requests; we rely on this.

### Two encodings

Controls can be encoded two ways in RWGPS, and some routes use both. Both are imported:

1. **Course points** (`course_points[]` with `t === 'Control'`): carry an authoritative distance `cp.d` (meters from start). In GPX these are the per-waypoint cue-sheet entries.
2. **Waypoints / POIs** (`points_of_interest[]` with `poi_type_name` in `control`, `start`, or `finish`): carry `lat`/`lng` but no distance. In GPX these are the top-level `<wpt>` entries with `<cmt>control</cmt>`. `start` and `finish` are included because the start and finish are always controls on a BRM route, and some organizers only mark the endpoints (not the intermediate controls) as POIs.

### POI distance interpolation

Because POIs lack a distance-along-route, `lib/rwgps.ts` interpolates: for each relevant POI it finds the nearest `track_points[]` entry by haversine distance (see `lib/geo.ts`) and uses that track point's `d` as the control's distance. If the nearest track point is more than **500 m** away, the POI is dropped as likely off-route. If the response has no `track_points`, POIs are skipped entirely.

On loop routes the start and finish addresses are the same physical location, which means a POI placed there is equidistant from two track points (one near `d=0`, one near `d=total`). To resolve the ambiguity the interpolator biases `start`-typed POIs toward the lower-`d` candidate and `finish`-typed POIs toward the higher-`d` candidate.

### Dedupe

Two passes:

1. **Physical pre-dedupe** (before interpolation): if two POIs share a `poi_type_name` and are within **200 m** of each other by lat/lng, collapse to one. This targets the common pattern of a bare label POI (`Start: Waterloo`) co-existing with an explicit control POI (`CONTROL Start A&W, Waterloo`) at the same parking lot. Tie-breaker: prefer the entry whose name carries an explicit `CONTROL`/`CTL`/`CTRL` prefix, since that signals organizer intent.

2. **Route-distance dedupe** (after interpolation): any two controls within **100 m** of each other along the route collapse to one. Precedence is `control`-type POI > `start`/`finish`-type POI > course point, because organizer-curated POI names are typically more descriptive than the short course instruction text. Distance-along-route is the right metric here — it naturally handles loop routes where a legitimate `start` and `finish` sit at the same physical place but should remain distinct controls at km 0 and km N.

### Name cleanup

Common prefixes on control names are stripped from both sources: `CTL - `, `CTL-`, `CTL `, `CTRL - `, `CTRL-`, `CTRL `, `CONTROL - `, `CONTROL-`, `CONTROL `, and a leading `-`/`- `. This keeps organizer-friendly names like `CTL - Little Lake` from cluttering the printed card. Lives in `cleanControlName()` in `lib/rwgps.ts`.

### Errors

`fetchRwgpsControls` throws with a user-facing message when the HTTP request fails or when neither source yields any control. The forms catch and surface the message inline.

Manual entry is always available regardless of RWGPS import.

## Riders and blank cards

- **Admin flow**: riders are the event's registered riders (with management tokens). Extra blank cards can be added for day-of registrations via the `extraBlank` input. If no registrations exist and no extras are requested, the form prints **2 blank cards** by default.
- **Public flow**: riders are entered by name in the form. Blank-card default is **1** if no riders or extras.

The print renderer pairs riders 2-per-sheet (`riderPairs`). A `null` is inserted for an unpaired final rider so the layout stays consistent.

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

There are no integration/E2E tests for the print pages themselves — they're layout-heavy and mostly a function of their inputs. If you change the print layout, verify visually in a real print preview; if you change BRM math or RWGPS parsing, update the unit tests red-then-green.

## Common extension points

- **New nominal distance (e.g., 1500 km)**: add to `NominalDistance`, `FINISH_LIMITS_MIN`, `OPEN_SEGMENTS`, `closeHours`, and `getNominalDistance` in `lib/brmTimes.ts`. Add corresponding test cases.
- **New field on the card**: add to `CardEvent`/`CardRider`/`OrganizerInfo` in `types/control-card.ts`, thread it through both print pages (`app/control-cards/print/page.tsx` and `app/admin/events/[id]/control-cards/print/page.tsx`), and render it in `components/admin/control-cards-print.tsx`.
- **New QR code**: add URL construction in the print page(s), add a prop to `<ControlCardsPrint>`, render a third `QRCodeSVG` and adjust the sizing/layout in `CardFront`.
- **Regulation text change**: edit `REGULATIONS_TEXT` in `types/control-card.ts`. The renderer splits each entry on its first colon to bold the label.

## Operational notes

_(These are the end-user-facing notes from the previous version of this doc. Retained here so the admin workflow isn't undocumented.)_

### Generating control cards

Navigate to **Admin > Events > [Event] > Control Cards**.

Control points can be added in two ways:

1. **Manual entry** — add controls one by one with name and distance (km).
2. **Import from RWGPS** — if the event has a linked RideWithGPS route, click "Import from RWGPS" to pull in controls automatically. Controls must be marked with type "Control" as course points in the RWGPS route editor.

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
