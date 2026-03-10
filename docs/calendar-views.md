# Calendar views

The calendar pages (`/calendar`, `/calendar/[chapter]`) support two view modes:

## List view (default)

Events grouped by month, displayed as a vertical list with date blocks and event details. Optimized for fast scanning of upcoming events.

## Grid view

A traditional month-by-month calendar grid with events placed on their dates.

- **Desktop**: full 7-column grid (Mon-Sun) with event cards showing distance, name, time, and chapter.
- **Mobile**: compact date grid with dot indicators for event days; event details expand below each week row.

## View toggle

A toggle group (List/Grid) appears in the toolbar alongside the distance filter and subscribe button. The toggle uses the `ToggleGroup` component from shadcn/ui with `outline` variant.

## Preference persistence

The selected view is saved to `localStorage` under the key `ro-calendar-view`. On page load, the saved preference is restored. If no preference is saved (or the value is invalid), the list view is used as the default.

This follows the same localStorage pattern used elsewhere in the app (e.g., `ro-registration` for saved form data).

## Key files

| File                                                | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `components/calendar-page.tsx`                      | Main calendar page component with view toggle and filter |
| `components/calendar-grid-view.tsx`                 | Grid view component                                      |
| `components/event-card.tsx`                         | List view components (EventCard, EventList)              |
| `tests/unit/components/calendar-page.test.tsx`      | Tests for view toggle, localStorage, and filtering       |
| `tests/unit/components/calendar-grid-view.test.tsx` | Tests for grid view rendering                            |
