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

| Distance | Text (list)   | Cell background (grid) | Print border/text (grid)                  |
| -------- | ------------- | ---------------------- | ----------------------------------------- |
| 200 km   | `yellow-600`  | `bg-yellow-600`        | `border-yellow-700` / `text-yellow-800`   |
| 300 km   | `lime-600`    | `bg-lime-600`          | `border-lime-700` / `text-lime-800`       |
| 400 km   | `purple-600`  | `bg-purple-600`        | `border-purple-700` / `text-purple-800`   |
| 600 km   | `orange-600`  | `bg-orange-600`        | `border-orange-700` / `text-orange-800`   |
| 1000 km+ | `neutral-900` | `bg-neutral-900`       | `border-neutral-900` / `text-neutral-900` |

Populaires (under 200 km) and any non-standard distance keep the default muted
styling in both views. Cancelled events are never given a medal background — they
stay muted so the cancellation reads clearly. The list-view text colours each ship
with a `dark:` counterpart for parity with the rest of the design system, though
dark mode is not currently toggleable on the site.

## Cancelled events

Cancelled events stay visible in the public calendar (both list and grid views) until their date passes. They render with a `Cancelled` badge, muted styling, and no Register button. The event's description is still shown on `/register/[slug]` along with a banner indicating the cancellation, so admins can include a short explanation by editing the description.

iCal subscribers see the cancellation propagate to their personal calendars as `STATUS:CANCELLED` — most calendar apps render this with strikethrough.

## Registered marker

Both public calendar views mark events the visitor is registered for, without requiring sign-in. Identity comes from the email in the same `ro-registration` localStorage record used by `MyRidesSection` and the registration forms (see `lib/registration-storage.ts`) — the `useRegisteredSlugs` hook (`hooks/use-registered-slugs.ts`) reads it on mount and, if present, calls the existing `getMyUpcomingRides(email)` server action unchanged, collecting the returned slugs into a `Set<string>`. No saved email means no lookup and an empty set; a failed or empty lookup also just leaves the set empty. Because `getMyUpcomingRides` only returns **upcoming, still-scheduled** registrations, past rides and events the rider cancelled out of are never marked.

`CalendarPage` owns the hook call and passes the resulting `registeredSlugs` down to both views:

- **List view** (`EventCard`/`EventList`): a registered event shows an outline `Badge` — check icon plus the word "Registered" — right after the distance chip in the title row, and its hover-revealed action swaps from the red "Register" button to a neutral outline "Details" link (both point at `/register/[slug]`; nothing changes about what page they land on).
- **Grid view** (`CalendarGridView`): a registered event's bar (desktop) and detail row (mobile) get a small check icon inline before the name, and `eventLinkLabel` appends `, registered` to the link's aria-label (after the chapter, before any draft/cancelled state) so the marker isn't sighted-only.

Cancelled and draft events are never marked as registered, even if their slug is technically in the set — a cancelled or draft event isn't something you're actually signed up to ride, so both `EventCard` and the grid's `EventBar`/mobile row gate the marker on `status === 'scheduled'`.

## View toggle

A toggle group (List/Grid) appears in the toolbar alongside the distance filter and subscribe button. The toggle uses the `ToggleGroup` component from shadcn/ui with `outline` variant.

## Preference persistence

The selected view is saved to `localStorage` under the key `ro-calendar-view`. On page load, the saved preference is restored. If no preference is saved (or the value is invalid), the list view is used as the default.

This follows the same localStorage pattern used elsewhere in the app (e.g., `ro-registration` for saved form data).

## Admin usage

`/admin/events?view=grid` renders the same `CalendarGridView` for the whole filtered season (no pagination). The admin page passes `hrefFor` so cells link to `/admin/events/[id]` (carrying the list filters as `from_*` params, including `from_view`) instead of `/register/[slug]`. Admin rows are adapted with `lib/admin/map-event-for-grid.ts`.

## Draft events

`Event.status` may be `'draft'`. By default public data reads never emit it (drafts are filtered by status and hidden by RLS), so it only appears in admin. When the server-only `SHOW_DRAFT_EVENTS=true` flag is set (see `lib/draft-preview.ts` and `docs/guide.md` → "Previewing drafts on the public site"), the public reads in `lib/data/events.ts` switch to the service-role client and include `'draft'` in their status filter, so drafts appear on the public calendar too — the flag is off by default and requires a Vercel redeploy to change.

Draft cells keep the medal hue of their distance but never the solid fill: `distanceMedalDraftClass` renders a dashed medal-coloured border over a faint tint with medal-coloured text, plus a `Draft` label. Non-medal drafts (populaires, odd distances) fall back to a neutral dashed border and muted text. On mobile the `(draft)` row's distance badge is a dashed outline in the medal text colour, and the day dot stays muted. This applies in the admin grid and, when the preview flag is on, the public grid.

The public list view (`EventCard`) matches this treatment: the distance badge uses `distanceMedalDraftClass` with a small uppercase "Draft" label beside it, and — unlike cancelled rows — the card is not dimmed, since a draft is a real plan rather than a dead event. Instead of the red "Register" button, draft rows show a plain outline "Details" link to the event page.

When a page has any draft events (public calendar only, and only with the preview flag on), `CalendarPage` renders a dashed-border notice between the hero and the filters, in both list and grid views: "The {year} schedule is a draft. Events and dates may change. Registration opens once the schedule is final." `{year}` is the earliest calendar year among the page's draft events, computed from the full event list so it doesn't change as the distance filter is applied.

## Printing

Grid view is the print target; list view has no dedicated print styling.

- **Layout.** Print targets the browser's default sheet (portrait letter
  with the browser's own margins). There is deliberately no `@page size`
  rule: Safari ignores one, and in Chrome a named landscape page forces the
  sheet to landscape while the `orientation` media query still reports the
  dialog's (portrait) choice, so row heights and sheet shape disagree. The
  grid root carries `.calendar-grid-print` purely as a hook. The content
  container drops its max-width and padding in print so the grid uses the
  full sheet.
- **One month per sheet.** Each month `<section>` forces a page break before
  it (`print:break-before-page`), except the first, which starts on the
  current page (`first:print:break-before-auto`). Each week row is
  `print:break-inside-avoid` so a week never splits across a page break, and
  the weekday-name header row is `print:break-after-avoid` so it can't be
  orphaned from the first week.
- **Chrome hidden.** `Navbar`, `Footer`, and `PageHero` are `print:hidden`.
  The controls row (view toggle, chapter/distance selects, subscribe button)
  in `CalendarPage` is also `print:hidden`. The draft-schedule `Alert`, if
  present, stays visible but drops its box in print — `print:mb-1
print:border-0 print:bg-transparent print:px-0 print:py-0` on the `Alert`,
  plus `print:text-xs` on its `AlertDescription` (needed because
  `AlertDescription`'s own `text-sm` would otherwise win) — so it prints as a
  single quiet line above the month heading.
- **Desktop grid forced on.** The mobile compact grid is `print:hidden` and
  the desktop 7-column grid is `print:block`, so printing from a phone still
  produces the full desktop layout.
- **Print heading.** `CalendarGridView` accepts an optional `printHeading`
  prop; when set, it renders as a small uppercase line above each month's
  `<h2>`, visible only in print (`hidden print:block`). `CalendarPage` passes
  `` `Randonneurs Ontario · ${title ?? chapter}` `` (the month heading already
  carries the year) so a
  printed page identifies itself without the (now-hidden) page hero.
- **Outline chips.** On paper, event chips drop their solid medal-coloured
  fill for a white background with a solid medal-coloured border and text —
  `distanceMedalCellClass` and `distanceMedalDraftClass` in
  `components/event-card.tsx` append `print:*` variants for this (see
  "Distance colour coding" above for the exact classes). Cancelled chips add
  `print:line-through`; neutral (populaire, cancelled) chips get a
  `print:border-neutral-400` outline in place of their grey fill. Chip text
  drops to 10px and wraps instead of truncating in print
  (`print:whitespace-normal`), since a truncated ride name on paper is
  useless.
- **No today marker.** The desktop grid's current-day highlight is reset in
  print (`print:font-normal print:text-muted-foreground`); a printout is
  read for weeks, so a fixed "today" would only mislead.
- **Density.** Week rows shrink to `print:min-h-[3.5rem]`, chip and lane
  padding tighten, and the month header is compact. A month with several
  five-lane weeks can still exceed one sheet; when it does, whole weeks move
  to the next page rather than being clipped or shrunk. Week rows are
  `print:min-h-[6rem]` so a portrait sheet fills out; if the user picks
  landscape in the print dialog, `print:landscape:min-h-[3.5rem]` (Tailwind's
  `landscape:` orientation variant stacked under `print:`) tightens them so a
  busy month still fits one sheet.
- **Chapter suffix.** `CalendarGridView` accepts an optional
  `printOmitChapter` prop; when set, each chip's ` · {chapterName}` suffix is
  wrapped in a `print:hidden` span (screen display is unchanged).
  `CalendarPage` passes `printOmitChapter={chapterSlug !== 'all'}`, since a
  single-chapter printout doesn't need every ride to repeat the chapter it's
  already scoped to; the all-chapters calendar keeps the suffix so rides stay
  distinguishable on paper.

## Key files

| File                                                | Purpose                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `components/calendar-page.tsx`                      | Main calendar page component with view toggle and filter    |
| `components/calendar-grid-view.tsx`                 | Grid view component                                         |
| `lib/calendar/event-spans.ts`                       | ACP-limit spans, week segments, and lane packing            |
| `components/event-card.tsx`                         | List view components (EventCard, EventList)                 |
| `hooks/use-registered-slugs.ts`                     | Reads `ro-registration` email and looks up registered slugs |
| `components/admin/event-filters.tsx`                | Admin List/Grid toggle                                      |
| `lib/admin/map-event-for-grid.ts`                   | Admin row → `Event` adapter                                 |
| `tests/unit/components/calendar-page.test.tsx`      | Tests for view toggle, localStorage, and filtering          |
| `tests/unit/components/calendar-grid-view.test.tsx` | Tests for grid view rendering                               |
| `tests/unit/lib/calendar/event-spans.test.ts`       | Tests for span derivation, segments, and lane packing       |
