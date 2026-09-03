# Calendar views

The calendar pages (`/calendar`, `/calendar/[chapter]`) support two view modes:

## List view (default)

Events grouped by month, displayed as a vertical list with date blocks and event details. Optimized for fast scanning of upcoming events.

## Grid view

A traditional month-by-month calendar grid with events placed on their dates.

- **Desktop**: full 7-column grid (Mon-Sun) with event bars showing distance, name, time, and chapter.
- **Mobile**: compact date grid with dot indicators for event days; event details expand below each week row.

### Multi-day bars

Rides whose ACP time limit runs past midnight are drawn as bars spanning every
day they cover, Google-Calendar style, rather than as a chip sitting only in the
start-day cell. A 600 starting Saturday 06:00 has a 40h limit, so it finishes
22:00 Sunday and its bar covers Sat–Sun; a 1200 starting Thursday 04:00 (90h)
covers Thu–Sun.

**Deriving the span.** Nothing extra is fetched — the span comes from the
event's `date`, `startTime`, and `distance`:

- The limit is `getAcpTimeLimitMinutes(distanceKm)` (`lib/events/finish-time.ts`,
  backed by `FINISH_LIMITS_MIN`).
- End-day offset is `floor((startMinutes + limitMinutes - 1) / 1440)`; the span
  is that offset plus one day. The `- 1` keeps a cutoff that lands exactly on
  midnight (a 200 starting 10:30) on the start day.
- Flèches use their 24h team limit rather than the distance band.
- This is the **strict** limit. It deliberately omits the extra grace day that
  `getFinishDayOptions()` adds for recording over-limit finishes.
- Populaires (under 200 km) have no ACP limit and stay single-day.
  `getNominalDistance()` would round them up into the 200 km band, which is why
  the calendar checks the distance itself rather than trusting that helper.
- A missing or unparseable `startTime` also falls back to a single day.

Cancelled and draft events span like any other; they keep their muted / dashed
styling.

**Lanes.** Each Mon–Sun week is laid out independently. Every event overlapping
the week — including ones that started in an earlier week or month — becomes a
segment with a start column, a column span, and `continuesBefore` /
`continuesAfter` flags. Segments are ordered by start date, then longer span,
then source order, and each takes the first lane whose columns are all free, so
a short ride slots back into lane 0 once the bar above it has ended. Each lane
renders as one CSS grid row inside the week; single-day events are just span-1
segments in the same system.

**Month boundaries.** The grid emits a month for any event that _continues into_
it, not only for events that start there — a 600 on May 31 produces a June grid
showing its Monday tail. Bars clip at the month edge with the appropriate
continuation flag set.

**Continuation cues.** A segment that continues off either side has that side's
corners flattened (`rounded-l-none` / `rounded-r-none`), and a continued-into
segment is prefixed with a small `↵`. Multi-day bars add the limit to the second
line, e.g. `6:00am · 40h limit · Toronto`.

**Accessibility.** The desktop grid deliberately carries no ARIA `grid` role:
spanning bars can't be expressed as a 7-cell row, and the component has no
arrow-key navigation, so claiming `grid` would promise semantics it can't keep.
Instead each month is a heading and every bar is a link whose `aria-label`
carries the full date (and, for multi-day bars, the span and limit), e.g.
`Saturday 600, 600 km, Saturday, May 16, 6:00am, 2 days (40h limit), Toronto`.
The visual day-name header row is `aria-hidden`. Bars are emitted in the DOM by
start column then lane (grid placement is explicit, so this is layout-neutral)
so that Tab walks a week by date rather than lane by lane.

**Mobile.** Dots appear on every day a ride spans (and the sr-only count
includes spanning rides), but the detail list below the week still lists each
event once — on the week it starts, or on the first week of the month when it
continues in from the previous month.

## Distance colour coding

Events are colour-coded by distance to match the corresponding ACP medal. Two
helpers in `components/event-card.tsx` provide the classes:

- **List view** uses `distanceMedalColorClass()` — the distance label text (e.g.
  `200 km`) takes the medal colour, everything else unchanged.
- **Grid view** uses `distanceMedalCellClass()` — the whole event cell is filled
  with a solid medal background and rendered with light (white) text. This applies
  to both the desktop cell and the mobile distance badge.

| Distance | Text (list)   | Cell background (grid) |
| -------- | ------------- | ---------------------- |
| 200 km   | `yellow-600`  | `bg-yellow-600`        |
| 300 km   | `lime-600`    | `bg-lime-600`          |
| 400 km   | `purple-600`  | `bg-purple-600`        |
| 600 km   | `orange-600`  | `bg-orange-600`        |
| 1000 km+ | `neutral-900` | `bg-neutral-900`       |

Populaires (under 200 km) and any non-standard distance keep the default muted
styling in both views. Cancelled events are never given a medal background — they
stay muted so the cancellation reads clearly. The list-view text colours each ship
with a `dark:` counterpart for parity with the rest of the design system, though
dark mode is not currently toggleable on the site.

## Cancelled events

Cancelled events stay visible in the public calendar (both list and grid views) until their date passes. They render with a `Cancelled` badge, muted styling, and no Register button. The event's description is still shown on `/register/[slug]` along with a banner indicating the cancellation, so admins can include a short explanation by editing the description.

iCal subscribers see the cancellation propagate to their personal calendars as `STATUS:CANCELLED` — most calendar apps render this with strikethrough.

## View toggle

A toggle group (List/Grid) appears in the toolbar alongside the distance filter and subscribe button. The toggle uses the `ToggleGroup` component from shadcn/ui with `outline` variant.

## Preference persistence

The selected view is saved to `localStorage` under the key `ro-calendar-view`. On page load, the saved preference is restored. If no preference is saved (or the value is invalid), the list view is used as the default.

This follows the same localStorage pattern used elsewhere in the app (e.g., `ro-registration` for saved form data).

## Admin usage

`/admin/events?view=grid` renders the same `CalendarGridView` for the whole filtered season (no pagination). The admin page passes `hrefFor` so cells link to `/admin/events/[id]` (carrying the list filters as `from_*` params, including `from_view`) instead of `/register/[slug]`. Admin rows are adapted with `lib/admin/map-event-for-grid.ts`.

## Draft events

`Event.status` may be `'draft'`. Public data reads never emit it (drafts are filtered by status and hidden by RLS), so it only appears in admin. Draft cells use a dashed border, muted text, a `Draft` label, and no medal fill; the mobile dot is muted and the row shows `(draft)`.

## Key files

| File                                                | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `components/calendar-page.tsx`                      | Main calendar page component with view toggle and filter |
| `components/calendar-grid-view.tsx`                 | Grid view component                                      |
| `lib/calendar/event-spans.ts`                       | ACP-limit spans, week segments, and lane packing         |
| `components/event-card.tsx`                         | List view components (EventCard, EventList)              |
| `components/admin/event-filters.tsx`                | Admin List/Grid toggle                                   |
| `lib/admin/map-event-for-grid.ts`                   | Admin row → `Event` adapter                              |
| `tests/unit/components/calendar-page.test.tsx`      | Tests for view toggle, localStorage, and filtering       |
| `tests/unit/components/calendar-grid-view.test.tsx` | Tests for grid view rendering                            |
| `tests/unit/lib/calendar/event-spans.test.ts`       | Tests for span derivation, segments, and lane packing    |
