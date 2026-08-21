# Calendar views

The calendar pages (`/calendar`, `/calendar/[chapter]`) support two view modes:

## List view (default)

Events grouped by month, displayed as a vertical list with date blocks and event details. Optimized for fast scanning of upcoming events.

## Grid view

A traditional month-by-month calendar grid with events placed on their dates.

- **Desktop**: full 7-column grid (Mon-Sun) with event cards showing distance, name, time, and chapter.
- **Mobile**: compact date grid with dot indicators for event days; event details expand below each week row.

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
| `components/event-card.tsx`                         | List view components (EventCard, EventList)              |
| `components/admin/event-filters.tsx`                | Admin List/Grid toggle                                   |
| `lib/admin/map-event-for-grid.ts`                   | Admin row → `Event` adapter                              |
| `tests/unit/components/calendar-page.test.tsx`      | Tests for view toggle, localStorage, and filtering       |
| `tests/unit/components/calendar-grid-view.test.tsx` | Tests for grid view rendering                            |
