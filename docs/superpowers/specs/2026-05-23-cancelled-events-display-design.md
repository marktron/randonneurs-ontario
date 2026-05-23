# Cancelled Events Display — Design

## Problem

When an admin changes an event's status to `cancelled`, the event silently disappears from every public surface: the all-chapters calendar, the chapter calendars, the permanents calendar, and the iCal feed. Riders who missed the cancellation email find that the event "just isn't there anymore," which has caused real confusion (a recent weather cancellation prompted multiple emails from riders asking why a ride vanished from the site).

We want cancelled events to remain visible on the public calendar — clearly marked as cancelled — and we want the admin to be nudged into adding a short cancellation announcement to the event's description at the moment they cancel it, so that visitors who land on the event page understand what happened.

## Goals

- A cancelled future event still appears in the public calendar (list and grid), clearly marked, with the Register button suppressed.
- The event detail page (`/register/[slug]`) loads for a cancelled event, displays a banner that the event is cancelled, hides the registration form, and still shows the description and registered riders.
- The iCal feed includes cancelled events with `STATUS:CANCELLED` so subscribers see the cancellation in their personal calendars.
- When the admin transitions an event into `cancelled`, a modal prompts them to edit the event description (pre-filled with the current description) so they can prepend a cancellation announcement. The admin can keep the description unchanged if they choose.
- Past cancelled events fall off the calendar naturally via the existing `event_date >= today` filter.

## Non-goals

- No separate `cancellation_message` column or new schema. The cancellation announcement lives in the existing `events.description` field.
- No automatic prepending or templated copy. The textarea pre-fills with the current description verbatim; the admin writes whatever they want.
- No notification email tied to the cancellation flow. Email communication continues to be handled out-of-band by the admin.
- No changes to the `cancelled → scheduled` un-cancel path. The admin can edit the description on the regular event form afterward.
- No changes to how cancelled events appear in admin lists or to result/registration handling on cancellation (results are still deleted; ERW event is still cleaned up).

## Data layer

### Public list queries (`lib/data/events.ts`)

Widen the status filter on three query functions:

- `getEventsByChapterInner` — chapter calendar
- `getAllUpcomingEventsInner` — all-chapters calendar
- `getPermanentEventsInner` — permanents calendar

Change `.eq('status', 'scheduled')` to `.in('status', ['scheduled', 'cancelled'])` in each. The `event_date >= today` cutoff is unchanged, so past cancellations don't accumulate. Cache tags (`'events'`, `chapter-${slug}`, `'permanents'`) stay the same — `updateEventStatus` already revalidates them on status transitions.

Fleche events are queried in the same call as chapter events and share the same status filter widening.

### Event detail query (`getEventBySlugInner`)

Add `status` to the column selection and to the returned `EventDetails` type. This query already returns regardless of status, so no filter change is needed.

### `Event` type (`components/event-card.tsx`)

Add a `status: 'scheduled' | 'cancelled'` field to the exported `Event` interface. Populate it from every transform in `lib/data/events.ts`.

### iCal feed (`app/api/calendar/[chapter]/route.ts`)

Widen the `.in('status', [...])` filter to include `'cancelled'`. In the VEVENT builder, set `status: 'CANCELLED'` when the event row's status is `'cancelled'` (otherwise keep the existing `'CONFIRMED'`). The `ics` library's `EventAttributes` type accepts `'CANCELLED'` as a valid `status` value.

## Public UI

### Event card (`components/event-card.tsx`)

When `event.status === 'cancelled'`:

- Title (`h3`), distance label, meta line (time / location), and rider count get muted styling via `text-muted-foreground` and reduced opacity. The mobile inline date and the chapter-name kicker are also muted.
- A `Badge` with `variant="destructive"` reading `Cancelled` (capital C, sentence case) sits inline with the title, mirroring how the existing `Populaire` badge is placed.
- The Register button is removed. The Route button continues to render if `rwgpsId` is set.
- The date block on the left keeps full color so the day still scans at a glance.
- Order in the list is unchanged — cancelled events stay inline by date.

Rider count text stays as the existing `"12 riders"` / `"1 rider"` (no change to that copy).

### Calendar grid view (`components/calendar-grid-view.tsx`)

The per-day event chip for a cancelled event gets the same muted treatment (reduced opacity, muted foreground) plus a small `Cancelled` indicator that fits the grid's compact idiom. Match the existing chip style — don't introduce a new shape or layout.

### Registration page (`app/register/[slug]/page.tsx`)

When `event.status === 'cancelled'`:

- A destructive-variant `Alert` is rendered near the top of the meta block (after the header, before the description) reading `This event has been cancelled.` The description below it renders normally, so the admin's cancellation announcement is the first prose readers see.
- Both `RegisterCTA` instances (mobile drawer-trigger button and desktop sidebar form) are replaced with a short, plain `Registration is closed` notice — no form, no drawer.
- Hero image, route map, cue sheet link, registered riders list, and the past-results link all still render unchanged.
- The `EventJsonLd` component (`components/structured-data.tsx`) emits `eventStatus: 'https://schema.org/EventCancelled'` for cancelled events. (Default stays as the existing `EventScheduled` for scheduled events.) The component takes an optional `status` prop and branches on it.

## Admin cancel flow

### `EventStatusSelect` modal (`components/admin/event-status-select.tsx`)

Refactor the cancel-confirmation modal so it **always** opens when an admin selects `Cancelled` (today it only opens when `resultsCount > 0`).

The modal contents:

- Title: `Cancel event?`
- Help text above the textarea: short copy guiding the admin to add a note at the top of the description. Example: `Add a cancellation note at the top of the description. Riders will see this on the public event page.`
- A `Textarea` pre-filled with the event's current `description` (or empty string if null), reasonable rows (~6).
- If `resultsCount > 0`, an inline `Alert` with the existing `AlertTriangle` icon warning that the N results will be permanently deleted.
- Buttons: `Keep Event` (outline) and `Cancel Event` (destructive). The destructive button is always enabled — we nudge but don't force.

The component needs a new prop `initialDescription: string | null` passed from the admin event detail page (`app/admin/events/[id]/page.tsx`). When the admin clicks `Cancel Event`, the component calls `updateEventStatus(eventId, 'cancelled', { description })` with whatever is currently in the textarea.

### Server action `updateEventStatus` (`lib/actions/events.ts`)

Add an optional third parameter for an options object: `updateEventStatus(eventId, status, options?: { description?: string | null })`. When `options.description` is provided, include it in the `EventUpdate` payload alongside the status change. Everything else stays: results-on-cancellation deletion, ERW event deletion, audit log entry, cache revalidation.

The audit log entry continues to describe the status change. We do not need a separate audit row for the description edit — the status change implies it.

### Status-select transitions other than `cancelled`

Unchanged. `scheduled → completed` still fires the completion-email path; `cancelled → scheduled` (un-cancel) goes through without a modal.

## Tests

### New tests

- `components/event-card.tsx` — render test confirming a cancelled event displays the badge, muted styling cues (e.g., presence of `text-muted-foreground` or opacity utility), no Register link.
- `app/register/[slug]/page.tsx` — render test (or page integration test) confirming the cancelled banner shows, no registration form is rendered, and the description still renders.
- `lib/data/events.ts` — query tests (extend existing ones) confirming `getAllUpcomingEvents`, `getEventsByChapter`, `getPermanentEvents` include cancelled events with future dates and exclude cancelled events with past dates.
- `lib/actions/events.ts` — integration test confirming `updateEventStatus(id, 'cancelled', { description: '...new text...' })` writes both the status and the description in one update.
- `app/api/calendar/[chapter]/route.ts` — test confirming the feed includes a cancelled future event with `STATUS:CANCELLED`.

### Updated tests

- `components/admin/event-status-select.tsx` test — cover the always-open modal behavior, the textarea pre-fill, and the no-results path.

## Documentation

- `docs/calendar-views.md` gets a short note explaining how cancelled events appear in the list and grid.
- `docs/guide.md` (the admin guide — already documents event status changes around line 63) gets a short addition explaining the cancel-with-announcement modal and that the description prompt is the canonical place to write a rider-facing cancellation note.

## Verification

- `npm run typecheck` and `npm run lint` clean.
- `npm test` green.
- Playwright screenshots of: the all-chapters calendar list with a cancelled event, the calendar grid view with a cancelled event, the `/register/[slug]` page for a cancelled event.
- Admin cancel modal: not screenshotted, per the `app/admin/` exception in `CLAUDE.md`. Modal coverage relies on the updated unit test.

## Files touched (anticipated)

- `lib/data/events.ts` — query filter changes, type plumbing.
- `components/event-card.tsx` — `Event` type field, cancelled rendering.
- `components/calendar-grid-view.tsx` — cancelled chip rendering.
- `app/register/[slug]/page.tsx` — cancelled banner, hide CTA, pass `status` to `EventJsonLd`.
- `components/structured-data.tsx` — `EventJsonLd` accepts `status` prop, branches `eventStatus`.
- `components/admin/event-status-select.tsx` — always-open modal, description textarea.
- `app/admin/events/[id]/page.tsx` — pass `initialDescription` prop.
- `lib/actions/events.ts` — `updateEventStatus` signature + write.
- `app/api/calendar/[chapter]/route.ts` — status filter, VEVENT status.
- Test files corresponding to each of the above.
- Docs as noted above.
