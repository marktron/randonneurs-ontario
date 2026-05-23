# Cancelled Events Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cancelled events stay visible on the public calendar (marked CANCELLED, no Register button), the registration page shows a cancellation banner instead of vanishing, the iCal feed propagates the cancellation, and admins are nudged to add a rider-facing cancellation note via a modal at the moment they cancel.

**Architecture:** No schema changes. We widen three public list-query filters in `lib/data/events.ts` from `status = 'scheduled'` to `status IN ('scheduled', 'cancelled')`, propagate a new `status` field through the `Event` and `EventDetails` types, and branch the UI on that field. The admin cancel modal always opens (today it only opens when results exist) and includes a description textarea pre-filled with the event's current description. The server action `updateEventStatus` gains an optional third argument carrying the new description, written in the same update payload as the status flip. Cancellation announcements live in the existing `events.description` column — no new field.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Supabase Postgres, shadcn/ui (Radix), Tailwind CSS, vitest + happy-dom + Testing Library for unit tests, `ics` library for iCal generation.

**Spec:** `docs/superpowers/specs/2026-05-23-cancelled-events-display-design.md`

---

## File map

**Modified:**

- `components/event-card.tsx` — add `status` to `Event` type, render cancelled variant
- `components/calendar-grid-view.tsx` — render cancelled chip variant
- `components/structured-data.tsx` — `EventJsonLd` accepts `status` prop, branches `eventStatus`
- `components/admin/event-status-select.tsx` — always-open modal, description textarea
- `app/admin/events/[id]/page.tsx` — pass `initialDescription` to `EventStatusSelect`
- `app/register/[slug]/page.tsx` — cancelled banner, hide CTA, pass `status` to `EventJsonLd`
- `app/api/calendar/[chapter]/route.ts` — include cancelled in filter, set `STATUS:CANCELLED` in VEVENT
- `lib/data/events.ts` — widen list-query filters, plumb `status` through transforms, add to `EventDetails`
- `lib/actions/events.ts` — `updateEventStatus` accepts optional `{ description }` option
- `types/queries.ts` — extend `EventForCalendar` to include `status`
- `docs/calendar-views.md` — note on cancelled-event display
- `docs/guide.md` — note on cancel-with-announcement modal

**Created:**

- `tests/unit/components/event-card.test.tsx` — render tests for scheduled vs cancelled
- `tests/unit/components/event-status-select.test.tsx` — modal-always-open + textarea + action call

**Test files modified:**

- `tests/integration/actions/events.test.ts` — covers `updateEventStatus` with `description` option
- `tests/integration/api/calendar.test.ts` — covers cancelled VEVENT emits `STATUS:CANCELLED`
- `tests/unit/components/calendar-grid-view.test.tsx` — covers cancelled chip rendering

---

## Task 1: Add `status` to `Event` type and propagate through data layer

Foundation task: extend the `Event` interface and `EventDetails` interface, populate `status` in every transform in `lib/data/events.ts`, and widen the three public list-query filters to include cancelled events. After this task, public list queries return cancelled future events; UI does not yet differentiate them.

**Files:**

- Modify: `components/event-card.tsx` (Event type only — rendering changes happen in Task 3)
- Modify: `lib/data/events.ts` (filters, transforms, `EventDetails`, `getEventBySlugInner` column list)
- Test: `tests/unit/components/calendar-grid-view.test.tsx` (existing sample fixtures need a `status` value to stay type-safe)

- [ ] **Step 1.1: Add `status` field to the `Event` interface**

In `components/event-card.tsx`, add the field to the exported interface (alphabetize is not required; keep grouping with `slug`/`id` near the top):

```ts
export interface Event {
  id?: string // Event UUID for debugging
  slug: string // Event slug for registration link
  date: string // ISO date string
  name: string
  type: 'Populaire' | 'Brevet' | 'Fleche' | 'Permanent'
  distance: string
  startLocation: string
  startTime: string // HH:MM format
  status: 'scheduled' | 'cancelled' // Drives cancelled-event rendering
  registeredCount?: number // Number of registered riders
  chapterName?: string // Chapter name for all-chapters view
  rwgpsId?: string | null // RideWithGPS route ID for route link
}
```

- [ ] **Step 1.2: Add `status` to every `Event` transform in `lib/data/events.ts`**

There are three transform sites returning `Event`:

1. `getEventsByChapterInner` — the local `transformEvent` function around line 104. Add `status: event.status as 'scheduled' | 'cancelled'` to the returned object.
2. `getAllUpcomingEventsInner` — the inline `.map((event) => ({ ... }))` around line 169. Add the same field.
3. `getPermanentEventsInner` — the inline `.map((event) => ({ ... }))` around line 214. Add the same field.

Example for `getAllUpcomingEventsInner`:

```ts
return (events as EventWithRegistrationCountAndChapterAndRoute[]).map((event) => ({
  id: event.id,
  slug: event.slug,
  date: event.event_date,
  name: event.name,
  type: formatEventType(event.event_type),
  distance: event.distance_km.toString(),
  startLocation: event.start_location || '',
  startTime: event.start_time || '08:00',
  status: event.status as 'scheduled' | 'cancelled',
  registeredCount: event.public_registrations?.[0]?.count ?? 0,
  chapterName: event.chapters?.name || '',
  rwgpsId: event.routes?.rwgps_id ?? null,
}))
```

Note: the underlying `events.status` column may be one of `scheduled | cancelled | completed | submitted` per the DB schema, but the public-list queries filter to `['scheduled', 'cancelled']` only (see Step 1.4), so the cast is safe.

- [ ] **Step 1.3: Widen list-query status filters**

In `lib/data/events.ts`, change `.eq('status', 'scheduled')` to `.in('status', ['scheduled', 'cancelled'])` in three places:

- `getEventsByChapterInner` — both the `chapterResult` and `flecheResult` queries (lines ~81 and ~91)
- `getAllUpcomingEventsInner` — line ~159
- `getPermanentEventsInner` — line ~204

Do **not** touch `getAllEventSlugsInner` (line ~434) — that's used for static param generation and should stay scheduled-only (cancelled events shouldn't be pre-rendered fresh during build).

- [ ] **Step 1.4: Add `status` to `EventDetails` and `getEventBySlugInner`**

In `lib/data/events.ts`:

a. Add `status: 'scheduled' | 'cancelled'` to the `EventDetails` interface (around line 258):

```ts
export interface EventDetails {
  id: string
  slug: string
  name: string
  date: string
  startTime: string
  startLocation: string
  distance: number
  type: 'Brevet' | 'Populaire' | 'Fleche' | 'Permanent'
  chapterName: string
  chapterSlug: string
  rwgpsId: string | null
  routeSlug: string | null
  cueSheetUrl: string | null
  description: string | null
  imageUrl: string | null
  erwCanonicalUrl: string | null
  status: 'scheduled' | 'cancelled' // For cancelled-event UI on /register/[slug]
}
```

b. Add `status` to the column list in `getEventBySlugInner` (around line 468):

```ts
.select(`
  id,
  slug,
  name,
  event_date,
  start_time,
  start_location,
  distance_km,
  event_type,
  description,
  image_url,
  erw_canonical_url,
  status,
  chapters (name, slug),
  routes (slug, rwgps_id, cue_sheet_url)
`)
```

c. Add `status` to the returned object (around line 498):

```ts
return {
  id: typedEvent.id,
  // ...existing fields...
  imageUrl: typedEvent.image_url || null,
  erwCanonicalUrl: typedEvent.erw_canonical_url || null,
  status: (typedEvent.status === 'cancelled' ? 'cancelled' : 'scheduled') as
    | 'scheduled'
    | 'cancelled',
}
```

(Treat completed/submitted as scheduled-for-display purposes — those statuses don't appear on the public `/register/[slug]` page in normal flow, but the page does load by slug regardless of status, so we coerce defensively.)

d. The `EventWithRelations` type in `types/queries.ts` may need a `status` field. Check:

```
grep -n "EventWithRelations\b" /Users/mark/Developer/randonneurs-ontario/types/queries.ts
```

If the type uses `Pick<...>` or similar, extend it to include `status` so the `typedEvent.status` access typechecks. If it's a more general type that already includes `status`, no change needed.

- [ ] **Step 1.5: Fix existing `Event`-typed fixtures so the type extension compiles**

The new required field will break existing test fixtures. Update `tests/unit/components/calendar-grid-view.test.tsx`:

```ts
const sampleEvents: Event[] = [
  {
    slug: 'spring-100-2026-04-15',
    date: '2026-04-15',
    name: 'Spring 100',
    type: 'Populaire',
    distance: '100',
    startLocation: 'City Hall',
    startTime: '08:00',
    status: 'scheduled',
    chapterName: 'Toronto',
  },
  // ...repeat for the other two fixtures
]
```

Also grep for any other `Event[]` fixtures and add `status: 'scheduled'`:

```
grep -rn "type: 'Brevet'\|type: 'Populaire'" /Users/mark/Developer/randonneurs-ontario/tests --include="*.tsx" --include="*.ts"
```

For each fixture, add `status: 'scheduled'`. Don't change any test behavior — purely a type-fix.

- [ ] **Step 1.6: Run typecheck to confirm the type extension is clean**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 1.7: Commit**

```bash
git add components/event-card.tsx lib/data/events.ts types/queries.ts tests/unit/components/calendar-grid-view.test.tsx
git commit -m "$(cat <<'EOF'
Plumb event status through Event and EventDetails

Widen the three public list-query filters to include cancelled events
alongside scheduled ones, and propagate the status field through
transforms so downstream UI can branch on it. No rendering changes yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: iCal feed includes cancelled events with `STATUS:CANCELLED`

The chapter iCal route (`app/api/calendar/[chapter]/route.ts`) currently filters to `['scheduled', 'completed', 'submitted']` and hard-codes `status: 'CONFIRMED'` on every VEVENT. Widen the filter to include `'cancelled'`, extend the `EventForCalendar` type so we can read `status`, and branch the iCal status accordingly.

**Files:**

- Modify: `types/queries.ts` (extend `EventForCalendar`)
- Modify: `app/api/calendar/[chapter]/route.ts` (filter + status branch)
- Test: `tests/integration/api/calendar.test.ts`

- [ ] **Step 2.1: Write failing test for cancelled VEVENT emission**

Open `tests/integration/api/calendar.test.ts` and find the existing `describe` block for the calendar route. Add a new test using the existing mocks:

```ts
it('emits STATUS:CANCELLED for cancelled events', async () => {
  const calendarMock = (await import('@/lib/supabase')) as unknown as {
    __reset: () => void
    __mockChapterFound: (chapter: unknown) => void
    __mockEventsFound: (events: unknown[]) => void
  }
  calendarMock.__reset()
  calendarMock.__mockChapterFound({ id: 'chapter-1', name: 'Toronto' })
  calendarMock.__mockEventsFound([
    {
      id: 'event-cancelled-1',
      slug: 'spring-200',
      name: 'Spring 200',
      event_date: '2030-06-15',
      start_time: '08:00',
      start_location: 'City Hall',
      distance_km: 200,
      event_type: 'brevet',
      description: 'Cancelled due to weather.',
      status: 'cancelled',
    },
  ])

  const { GET } = await import('@/app/api/calendar/[chapter]/route')
  const response = await GET(new Request('https://example.com/api/calendar/toronto'), {
    params: Promise.resolve({ chapter: 'toronto' }),
  })

  const body = await response.text()
  expect(body).toContain('STATUS:CANCELLED')
  expect(body).not.toContain('STATUS:CONFIRMED\r\nUID:event-cancelled-1')
})
```

(Adjust the `GET` import/invocation to match how other tests in this file invoke the route handler. If the file already has a helper for calling the route, use it.)

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npm test -- tests/integration/api/calendar.test.ts`
Expected: FAIL — either with the cancelled event missing entirely from the feed, or with `STATUS:CONFIRMED` in the output.

- [ ] **Step 2.3: Extend the `EventForCalendar` type**

In `types/queries.ts` around line 478, add `status` to the `Pick<>`:

```ts
export type EventForCalendar = Pick<
  Event,
  | 'id'
  | 'slug'
  | 'name'
  | 'event_date'
  | 'start_time'
  | 'start_location'
  | 'distance_km'
  | 'event_type'
  | 'description'
  | 'status'
>
```

- [ ] **Step 2.4: Widen the status filter in the calendar route**

In `app/api/calendar/[chapter]/route.ts` around line 132:

```ts
.in('status', ['scheduled', 'completed', 'submitted', 'cancelled'])
```

Add `'status'` to the column projection on the same query (around line 129):

```ts
.select(
  'id, slug, name, event_date, start_time, start_location, distance_km, event_type, description, status'
)
```

- [ ] **Step 2.5: Branch the VEVENT status on `event.status`**

In `app/api/calendar/[chapter]/route.ts` around line 209, replace:

```ts
status: 'CONFIRMED' as const,
```

with:

```ts
status: (event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED') as 'CANCELLED' | 'CONFIRMED',
```

- [ ] **Step 2.6: Run the test to verify it passes**

Run: `npm test -- tests/integration/api/calendar.test.ts`
Expected: PASS

- [ ] **Step 2.7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2.8: Commit**

```bash
git add types/queries.ts app/api/calendar/[chapter]/route.ts tests/integration/api/calendar.test.ts
git commit -m "$(cat <<'EOF'
Propagate event cancellations through iCal feed

Calendar subscribers were missing cancellations because cancelled
events were excluded from the feed. Include them with STATUS:CANCELLED
so calendar clients render them with strikethrough rather than just
disappearing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Event card renders cancelled variant

When `event.status === 'cancelled'`, the card shows a `Cancelled` badge, mutes the title/meta/rider-count text, and hides the Register button. The Route button stays. The date block stays full color.

**Files:**

- Modify: `components/event-card.tsx`
- Create: `tests/unit/components/event-card.test.tsx`

- [ ] **Step 3.1: Write failing tests for the cancelled-event variant**

Create `tests/unit/components/event-card.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCard, type Event } from '@/components/event-card'

const baseEvent: Event = {
  id: 'evt-1',
  slug: 'spring-200',
  date: '2030-06-15',
  name: 'Spring 200',
  type: 'Brevet',
  distance: '200',
  startLocation: 'City Hall',
  startTime: '08:00',
  status: 'scheduled',
  registeredCount: 12,
  rwgpsId: '12345',
}

describe('EventCard', () => {
  describe('scheduled event', () => {
    it('renders a Register link', () => {
      render(<EventCard event={baseEvent} />)
      const links = screen.getAllByRole('link', { name: /register/i })
      expect(links.length).toBeGreaterThan(0)
    })

    it('does not render a Cancelled badge', () => {
      render(<EventCard event={baseEvent} />)
      expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
    })
  })

  describe('cancelled event', () => {
    const cancelledEvent: Event = { ...baseEvent, status: 'cancelled' }

    it('renders a Cancelled badge', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByText(/^cancelled$/i)).toBeInTheDocument()
    })

    it('does not render a Register link', () => {
      render(<EventCard event={cancelledEvent} />)
      const registerLinks = screen.queryAllByRole('link', { name: /register/i })
      expect(registerLinks).toHaveLength(0)
    })

    it('still renders the Route link when rwgpsId is set', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByRole('link', { name: /route/i })).toBeInTheDocument()
    })

    it('applies muted styling to the title', () => {
      render(<EventCard event={cancelledEvent} />)
      const heading = screen.getByRole('heading', { name: /spring 200/i })
      // The title sits inside an outer element that carries the opacity utility.
      // Walk up looking for the muting class — the test should pass for either
      // direct or ancestor application.
      let el: HTMLElement | null = heading
      let foundMuted = false
      while (el) {
        if (el.className.includes('opacity-') || el.className.includes('text-muted-foreground')) {
          foundMuted = true
          break
        }
        el = el.parentElement
      }
      expect(foundMuted).toBe(true)
    })

    it('still shows the rider count as "12 riders"', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByText(/12 riders/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npm test -- tests/unit/components/event-card.test.tsx`
Expected: FAIL — the `Cancelled` badge isn't rendered, and the Register link is still present for cancelled events.

- [ ] **Step 3.3: Implement the cancelled variant in `EventCard`**

In `components/event-card.tsx`, modify the `EventCard` component. Introduce an `isCancelled` flag and use it in the JSX. Full updated component body:

```tsx
export function EventCard({
  event,
  showDate = true,
  showBorder = true,
}: {
  event: Event
  showDate?: boolean
  showBorder?: boolean
}) {
  const { dayOfWeek, shortDayOfWeek, month, monthShort, day } = formatDate(event.date)
  const isCancelled = event.status === 'cancelled'

  return (
    <article
      {...devData('events', event.id)}
      className={`group relative sm:grid sm:grid-cols-[6rem_1fr] sm:gap-10 ${showDate ? 'pt-6 sm:pt-8' : 'pt-8 sm:pt-4'} ${showBorder ? 'border-b border-border/60 pb-6 sm:pb-8' : ''}`}
    >
      {/* Date block - visible on sm+ (stays full color even when cancelled) */}
      <div className="hidden sm:block text-center">
        {showDate ? (
          <>
            <div className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground">
              {month}
            </div>
            <div className="text-5xl font-serif tabular-nums leading-none mt-1">{day}</div>
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground mt-2">
              {dayOfWeek}
            </div>
          </>
        ) : (
          <div className="invisible">
            <div className="text-[11px]">&nbsp;</div>
            <div className="text-5xl mt-1">&nbsp;</div>
            <div className="text-[11px] mt-2">&nbsp;</div>
          </div>
        )}
      </div>

      {/* Event details */}
      <div className={`min-w-0 flex flex-col justify-center ${isCancelled ? 'opacity-60' : ''}`}>
        {/* Inline date - mobile only */}
        {showDate && (
          <div className="sm:hidden text-xs font-medium tracking-wide text-muted-foreground mb-2">
            {shortDayOfWeek}, {monthShort} {day}
          </div>
        )}
        {event.chapterName && (
          <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
            {event.chapterName}
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl leading-tight sm:text-2xl">
            {isCancelled ? (
              event.name
            ) : (
              <Link
                href={`/register/${event.slug}`}
                className="hover:text-primary transition-colors border-b border-transparent group-hover:border-current/50"
              >
                {event.name}
              </Link>
            )}
          </h3>
          <span className="text-sm tabular-nums text-muted-foreground">{event.distance} km</span>
          {event.type === 'Populaire' && (
            <Badge variant="outline" className="text-[10px] tracking-wider font-medium">
              Populaire
            </Badge>
          )}
          {isCancelled && (
            <Badge variant="destructive" className="text-[10px] tracking-wider font-medium">
              Cancelled
            </Badge>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{formatTime(event.startTime)}</span>
          {event.startLocation && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span>{event.startLocation}</span>
            </>
          )}
          {event.registeredCount !== undefined && event.registeredCount > 0 && (
            <>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span>
                {event.registeredCount} {event.registeredCount === 1 ? 'rider' : 'riders'}
              </span>
            </>
          )}
        </div>

        <div className="mt-3 md:mt-0 md:absolute md:right-0 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity flex items-center gap-2">
          {event.rwgpsId && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://ridewithgps.com/routes/${event.rwgpsId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Route
              </a>
            </Button>
          )}
          {!isCancelled && (
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" asChild>
              <Link href={`/register/${event.slug}`}>Register</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
```

Two notable changes: the title becomes plain text (no link) when cancelled — there's still a destination via the date/card context, and removing the link prevents an accidental click into a "you can't register here" page; and the entire details column gets `opacity-60` so the muting is consistent without sprinkling it across each child.

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test -- tests/unit/components/event-card.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 3.5: Commit**

```bash
git add components/event-card.tsx tests/unit/components/event-card.test.tsx
git commit -m "$(cat <<'EOF'
Render cancelled variant of EventCard

Cancelled events stay in the calendar list with a destructive Cancelled
badge, muted details, no Register button, and an unlinked title.
The date block keeps full color so the day still reads at a glance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Calendar grid view renders cancelled chip variant

The grid view's per-day event chip needs to mirror the list view's treatment: muted appearance and a small visual indicator that the event is cancelled. Match the existing chip idiom — small text, no badge component (badges are too tall for the chip).

**Files:**

- Modify: `components/calendar-grid-view.tsx`
- Test: `tests/unit/components/calendar-grid-view.test.tsx`

- [ ] **Step 4.1: Write failing test for cancelled chip rendering**

In `tests/unit/components/calendar-grid-view.test.tsx`, append a new `describe` block:

```ts
describe('cancelled events', () => {
  it('shows "(cancelled)" suffix on cancelled chips and no link', () => {
    const events: Event[] = [
      {
        slug: 'cancelled-200',
        date: '2026-04-15',
        name: 'Cancelled Ride',
        type: 'Brevet',
        distance: '200',
        startLocation: 'City Hall',
        startTime: '08:00',
        status: 'cancelled',
        chapterName: 'Toronto',
      },
    ]
    render(<CalendarGridView events={events} />)

    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0)
    // The cancelled chip should not be a registration link
    const registerLinks = screen
      .queryAllByRole('link')
      .filter((el) => el.getAttribute('href')?.includes('/register/cancelled-200'))
    expect(registerLinks).toHaveLength(0)
  })
})
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/calendar-grid-view.test.tsx`
Expected: FAIL — the cancelled event currently renders the same as a scheduled one (with a Register link).

- [ ] **Step 4.3: Render cancelled chips differently in the desktop grid**

In `components/calendar-grid-view.tsx`, modify the desktop event chip rendering (around line 158, inside `dayEvents?.map(...)`). Replace the current `Link`-wrapped chip with:

```tsx
{
  dayEvents?.map((event, ei) => {
    const isCancelled = event.status === 'cancelled'
    const chipContent = (
      <div
        className={`rounded px-1.5 py-1 text-[11px] leading-tight border border-border/40 ${
          isCancelled
            ? 'bg-muted/40 opacity-60 line-through-none'
            : 'bg-muted/70 hover:bg-muted transition-colors'
        }`}
      >
        <div className="font-medium truncate">
          {event.distance} km — {event.name}
          {isCancelled && (
            <span className="ml-1 font-normal text-muted-foreground">(cancelled)</span>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate">
          {formatTime(event.startTime)}
          {event.chapterName && ` · ${event.chapterName}`}
        </div>
      </div>
    )
    return isCancelled ? (
      <div key={ei} className="block mb-1 last:mb-0" aria-label={eventLinkLabel(event, date)}>
        {chipContent}
      </div>
    ) : (
      <Link
        key={ei}
        href={`/register/${event.slug}`}
        aria-label={eventLinkLabel(event, date)}
        className="block mb-1 last:mb-0"
      >
        {chipContent}
      </Link>
    )
  })
}
```

- [ ] **Step 4.4: Render cancelled chips differently in the mobile compact view**

Open the file to lines ~199–260 (mobile section). The mobile view shows event dots and an expandable list under each week row. Find the section that renders event details (look for the second `dayEvents?.map(...)` block) and apply the same `isCancelled` branching pattern:

- Replace the wrapping `Link` with a `div` when cancelled.
- Append `(cancelled)` to the chip text.
- Add `opacity-60` to the chip styling when cancelled.

If the mobile section's structure differs and a clean mapping isn't obvious, restrict the cancelled treatment to the desktop chip and the mobile dot indicator (so dots still appear but don't link). Document the chosen approach with a one-line comment near the conditional.

- [ ] **Step 4.5: Run test to verify it passes**

Run: `npm test -- tests/unit/components/calendar-grid-view.test.tsx`
Expected: PASS (all existing tests + the new one)

- [ ] **Step 4.6: Commit**

```bash
git add components/calendar-grid-view.tsx tests/unit/components/calendar-grid-view.test.tsx
git commit -m "$(cat <<'EOF'
Render cancelled variant of calendar grid chips

Match the list view: muted chip, "(cancelled)" suffix, no register
link. Keeps the day cell readable without making it a click target
that lands on a closed registration page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Registration page shows cancelled banner and hides CTA

`/register/[slug]` should still load for cancelled events but show a destructive `Alert` banner, replace the `RegisterCTA` with a "Registration is closed" notice, and emit `EventCancelled` in the JSON-LD.

**Files:**

- Modify: `components/structured-data.tsx` (`EventJsonLd` accepts and branches on `status`)
- Modify: `app/register/[slug]/page.tsx` (Alert + replace CTA + pass status)

- [ ] **Step 5.1: Extend `EventJsonLd` to accept `status`**

In `components/structured-data.tsx`, update the interface and implementation:

```ts
interface EventJsonLdProps {
  name: string
  date: string
  startTime: string
  location?: string | null
  description?: string | null
  url: string
  imageUrl?: string | null
  status?: 'scheduled' | 'cancelled'
}

export function EventJsonLd({
  name,
  date,
  startTime,
  location,
  description,
  url,
  imageUrl,
  status = 'scheduled',
}: EventJsonLdProps) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    startDate: `${date}T${startTime}`,
    url,
    sport: 'Cycling',
    organizer: {
      '@type': 'SportsOrganization',
      name: 'Randonneurs Ontario',
      url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca',
    },
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus:
      status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
  }

  if (location) {
    data.location = {
      '@type': 'Place',
      name: location,
    }
  }

  if (description) {
    data.description = description
  }

  if (imageUrl) {
    data.image = imageUrl
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
```

- [ ] **Step 5.2: Update `/register/[slug]/page.tsx` to handle cancelled events**

In `app/register/[slug]/page.tsx`:

a. Add `Alert`/`AlertDescription` import alongside the existing imports (top of file):

```tsx
import { Alert, AlertDescription } from '@/components/ui/alert'
```

b. After `const event = await getEventBySlug(slug)` and the `notFound()` check, derive the flag:

```tsx
const isCancelled = event.status === 'cancelled'
```

c. Pass `status` into `EventJsonLd` (the existing call near line 101):

```tsx
<EventJsonLd
  name={flecheDisplayName || formatRideName(event.name, event.distance)}
  date={event.date}
  startTime={event.startTime}
  location={event.startLocation}
  description={event.description}
  url={`${baseUrl}/register/${slug}`}
  imageUrl={event.imageUrl}
  status={event.status}
/>
```

d. Inside the meta header block, after the meta `<div>` row (around line 206, after the closing `</div>` of the meta row and before the mobile Register CTA block), insert the cancelled banner:

```tsx
{
  isCancelled && (
    <Alert variant="destructive" className="mt-6">
      <AlertDescription>
        This event has been cancelled. See the description below for details.
      </AlertDescription>
    </Alert>
  )
}
```

e. Replace both `RegisterCTA` instances with the "Registration is closed" notice when cancelled. There are two: mobile (around line 209) and desktop sidebar (around line 309).

Mobile:

```tsx
<div className="lg:hidden mt-6">
  {isCancelled ? (
    <div className="rounded border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
      Registration is closed for this event.
    </div>
  ) : (
    <RegisterCTA
      eventId={event.id}
      isPermanent={event.type === 'Permanent'}
      isFleche={isFleche}
      existingTeams={flecheTeams}
    />
  )}
</div>
```

Desktop sidebar:

```tsx
<div className="hidden lg:block lg:w-[400px] lg:shrink-0">
  {isCancelled ? (
    <div className="rounded border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
      Registration is closed for this event.
    </div>
  ) : (
    <RegisterCTA
      eventId={event.id}
      isPermanent={event.type === 'Permanent'}
      isFleche={isFleche}
      existingTeams={flecheTeams}
    />
  )}
</div>
```

- [ ] **Step 5.3: Add a typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5.4: Manual verification via Playwright (capture screenshots)**

Per CLAUDE.md, screenshots are required for public UI changes. Steps:

1. Check whether the dev server is already running at `http://localhost:3000/`. If not, start it.
2. Seed a cancelled event in the dev database (use the admin UI: log in, pick a future event, set status to cancelled with a short description note).
3. Capture screenshots via Playwright MCP or manual screenshots of:
   - `/calendar` (list view) showing the cancelled event among scheduled ones
   - `/calendar?view=grid` (or after toggling to grid) showing the cancelled chip
   - `/register/[cancelled-event-slug]` showing the banner + the description + no form
4. Attach the screenshots to the PR description in Task 8.

If the dev DB doesn't have a future event to cancel, skip the screenshots and note this in the PR description — the unit tests cover the rendering.

- [ ] **Step 5.5: Commit**

```bash
git add components/structured-data.tsx app/register/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
Show cancelled banner on /register/[slug] and hide CTA

Cancelled events now land users on the event page with a destructive
Alert, the description (which carries the admin's cancellation note),
and a closed-registration notice instead of the registration form.
JSON-LD eventStatus reflects the cancellation for search engines.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Server action accepts `description` option

Extend `updateEventStatus` to accept an optional third argument carrying a new description. When provided, it's written in the same update payload as the status flip. Everything else stays.

**Files:**

- Modify: `lib/actions/events.ts`
- Test: `tests/integration/actions/events.test.ts`

- [ ] **Step 6.1: Write failing test asserting description is written**

In `tests/integration/actions/events.test.ts`, inside the `describe('updateEventStatus', ...)` block (after line ~965 where the existing cancelled test ends), add:

```ts
it('writes description alongside status when description option is provided', async () => {
  mockModule.__mockEventFound({
    id: 'event-1',
    name: 'Test Event',
    event_date: '2030-06-15',
    distance_km: 200,
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    status: 'scheduled',
    chapters: { name: 'Toronto' },
  })
  mockModule.__mockUpdateSuccess() // For deleting results
  mockModule.__mockUpdateSuccess() // For status update
  mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

  const result = await updateEventStatus('event-1', 'cancelled', {
    description: 'CANCELLED: weather. Original description follows.\n\nA brevet through Toronto.',
  })

  expect(result.success).toBe(true)

  // The events update call should have included a description field
  const eventsUpdateCalls = mockModule.__calls.filter(
    (c) => c.table === 'events' && c.method === 'update'
  )
  const updateWithDescription = eventsUpdateCalls.find((call) => {
    const payload = call.args?.[0] as { description?: string } | undefined
    return payload?.description?.startsWith('CANCELLED: weather.')
  })
  expect(updateWithDescription).toBeDefined()
})
```

- [ ] **Step 6.2: Run the test to verify it fails**

Run: `npm test -- tests/integration/actions/events.test.ts -t "writes description"`
Expected: FAIL — the third argument isn't accepted, and even if TypeScript ignores it, the description isn't in the update payload.

- [ ] **Step 6.3: Extend the `updateEventStatus` signature**

In `lib/actions/events.ts` around line 386, change the signature:

```ts
export async function updateEventStatus(
  eventId: string,
  status: EventStatus,
  options?: { description?: string | null }
): Promise<ActionResult> {
```

And around line 422, change:

```ts
const updateData: EventUpdate = { status }
```

to:

```ts
const updateData: EventUpdate = { status }
if (options?.description !== undefined) {
  updateData.description = options.description
}
```

(Using `!== undefined` rather than truthiness so an explicit `null` or empty string is still respected.)

- [ ] **Step 6.4: Run the test to verify it passes**

Run: `npm test -- tests/integration/actions/events.test.ts -t "writes description"`
Expected: PASS

Also re-run the rest of the `updateEventStatus` suite to confirm no regression:

Run: `npm test -- tests/integration/actions/events.test.ts -t "updateEventStatus"`
Expected: PASS (all existing tests + the new one)

- [ ] **Step 6.5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6.6: Commit**

```bash
git add lib/actions/events.ts tests/integration/actions/events.test.ts
git commit -m "$(cat <<'EOF'
Let updateEventStatus optionally rewrite the description

Cancellation flow needs to save a rider-facing announcement at the
same moment the status flips. New options.description argument is
written in the same update payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin cancel modal always opens, prompts for description

Refactor `EventStatusSelect` so the modal always opens on `cancelled`, contains a `Textarea` pre-filled with the event's current description, shows the results-deletion warning inline when relevant, and calls `updateEventStatus` with the edited description in the new options bag.

**Files:**

- Modify: `components/admin/event-status-select.tsx`
- Modify: `app/admin/events/[id]/page.tsx`
- Create: `tests/unit/components/event-status-select.test.tsx`

- [ ] **Step 7.1: Write failing tests for the modal flow**

Create `tests/unit/components/event-status-select.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventStatusSelect } from '@/components/admin/event-status-select'

const mockUpdateEventStatus = vi.fn()

vi.mock('@/lib/actions/events', () => ({
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('EventStatusSelect cancel flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEventStatus.mockResolvedValue({ success: true })
  })

  async function selectCancelled() {
    const user = userEvent.setup()
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    const option = await screen.findByRole('option', { name: /cancelled/i })
    await user.click(option)
    return user
  }

  it('opens the modal when admin selects Cancelled even with zero results', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="A brevet through Toronto."
      />
    )

    await selectCancelled()

    expect(await screen.findByRole('dialog', { name: /cancel event/i })).toBeInTheDocument()
  })

  it('pre-fills the description textarea with the current description', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="A brevet through Toronto."
      />
    )

    await selectCancelled()

    const textarea = await screen.findByRole('textbox')
    expect(textarea).toHaveValue('A brevet through Toronto.')
  })

  it('shows a results-deletion warning when resultsCount > 0', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={5}
        initialDescription=""
      />
    )

    await selectCancelled()

    expect(await screen.findByText(/5 results.*deleted/i)).toBeInTheDocument()
  })

  it('does not show the results warning when resultsCount is 0', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription=""
      />
    )

    await selectCancelled()

    expect(screen.queryByText(/results.*deleted/i)).not.toBeInTheDocument()
  })

  it('calls updateEventStatus with the edited description on confirm', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="Original description."
      />
    )

    const user = await selectCancelled()

    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'CANCELLED: weather.\n\nOriginal description.')

    const confirmButton = await screen.findByRole('button', { name: /cancel event/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'cancelled', {
        description: 'CANCELLED: weather.\n\nOriginal description.',
      })
    })
  })

  it('does not open the modal when admin selects Completed', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription=""
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /completed/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'completed')
    })
  })
})
```

- [ ] **Step 7.2: Run the tests to verify they fail**

Run: `npm test -- tests/unit/components/event-status-select.test.tsx`
Expected: FAIL — `initialDescription` prop isn't accepted, modal doesn't open for zero-results, textarea doesn't exist, etc.

- [ ] **Step 7.3: Rewrite `EventStatusSelect`**

Replace the body of `components/admin/event-status-select.tsx` with:

```tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateEventStatus, type EventStatus } from '@/lib/actions/events'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle } from 'lucide-react'

// Only these statuses are selectable in the dropdown
// 'submitted' is set programmatically when results are emailed
const STATUS_OPTIONS: { value: Exclude<EventStatus, 'submitted'>; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface EventStatusSelectProps {
  eventId: string
  initialStatus: EventStatus
  resultsCount: number
  initialDescription: string | null
}

export function EventStatusSelect({
  eventId,
  initialStatus,
  resultsCount,
  initialDescription,
}: EventStatusSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<EventStatus>(initialStatus)
  const [showSaved, setShowSaved] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? '')

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    setDraftDescription(initialDescription ?? '')
  }, [initialDescription])

  const runUpdate = (newStatus: EventStatus, options?: { description?: string | null }) => {
    startTransition(async () => {
      const result = await updateEventStatus(eventId, newStatus, options)
      if (result.success) {
        setStatus(newStatus)
        setShowSaved(true)
        setTimeout(() => setShowSaved(false), 1500)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    })
  }

  const handleChange = (newStatus: EventStatus) => {
    if (newStatus === 'cancelled') {
      setShowCancelDialog(true)
      return
    }
    setStatus(newStatus)
    runUpdate(newStatus)
  }

  const handleConfirmCancel = () => {
    setShowCancelDialog(false)
    runUpdate('cancelled', { description: draftDescription })
  }

  if (status === 'submitted') {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">
        Submitted
      </Badge>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => handleChange(v as EventStatus)}
          disabled={isPending}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {showSaved && <Check className="h-4 w-4 text-green-600" />}
      </div>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel event?</DialogTitle>
            <DialogDescription>
              Add a cancellation note at the top of the description. Riders will see this on the
              public event page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="event-cancel-description">Event description</Label>
            <Textarea
              id="event-cancel-description"
              rows={8}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
            {resultsCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This event has {resultsCount} {resultsCount === 1 ? 'result' : 'results'}{' '}
                  recorded. Cancelling will permanently delete {resultsCount === 1 ? 'it' : 'them'}.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Event
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Event'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 7.4: Load `description` on the admin event detail page and pass it through**

The current admin event detail page does **not** load `description` (verified: `app/admin/events/[id]/page.tsx` lines 20–42). Three sub-edits:

a. In `types/queries.ts`, add `'description'` to the `EventDetailForAdmin` `Pick<>` (around line 303):

```ts
export type EventDetailForAdmin = Pick<
  Event,
  | 'id'
  | 'name'
  | 'event_date'
  | 'start_time'
  | 'distance_km'
  | 'event_type'
  | 'status'
  | 'season'
  | 'erw_event_id'
  | 'erw_canonical_url'
  | 'description'
> & {
  chapters: Pick<Chapter, 'id' | 'name'> | null
}
```

b. In `app/admin/events/[id]/page.tsx`, add `description` to the `getEventDetails` select list (around line 24):

```ts
.select(
  `
  id,
  name,
  event_date,
  start_time,
  distance_km,
  event_type,
  status,
  season,
  erw_event_id,
  erw_canonical_url,
  description,
  chapters (id, name)
`
)
```

c. In the same file, around line 180, update the `EventStatusSelect` invocation:

```tsx
<EventStatusSelect
  eventId={event.id}
  initialStatus={event.status as EventStatus}
  resultsCount={results.length}
  initialDescription={event.description ?? null}
/>
```

- [ ] **Step 7.5: Run the tests to verify they pass**

Run: `npm test -- tests/unit/components/event-status-select.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 7.6: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 7.7: Commit**

```bash
git add components/admin/event-status-select.tsx app/admin/events/[id]/page.tsx types/queries.ts tests/unit/components/event-status-select.test.tsx
git commit -m "$(cat <<'EOF'
Prompt for cancellation note when admin cancels an event

Cancel modal now always opens on the Cancelled transition and includes
a textarea pre-filled with the event's current description so the
admin can prepend a rider-facing cancellation note. Results-deletion
warning is rendered inline when relevant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Documentation updates + final verification + PR

Add a short note to `docs/calendar-views.md` covering cancelled-event display, and a corresponding note in the admin guide. Run the full verification suite, then prepare the PR description.

**Files:**

- Modify: `docs/calendar-views.md`
- Modify: `docs/guide.md`

- [ ] **Step 8.1: Update `docs/calendar-views.md`**

Add a new section after the "Grid view" section:

```markdown
## Cancelled events

Cancelled events stay visible in the public calendar (both list and grid views) until their date passes. They render with a `Cancelled` badge, muted styling, and no Register button. The event's description is still shown on `/register/[slug]` along with a banner indicating the cancellation, so admins can include a short explanation by editing the description.

iCal subscribers see the cancellation propagate to their personal calendars as `STATUS:CANCELLED` — most calendar apps render this with strikethrough.
```

- [ ] **Step 8.2: Update `docs/guide.md`**

Find the section on changing event status (around line 63 — `**Change the event status** using the dropdown.`). Add a short note immediately after that bullet:

```markdown
- When you set an event to **Cancelled**, a dialog opens with the event's current description in a textarea. Add a short cancellation note at the top — that note appears on the public event page so riders who missed the cancellation email can see what happened. If the event has results recorded, the dialog also warns that they will be deleted.
```

- [ ] **Step 8.3: Run the full verification suite**

Run all three checks:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all PASS. If anything fails, fix it before opening the PR.

- [ ] **Step 8.4: Commit docs**

```bash
git add docs/calendar-views.md docs/guide.md
git commit -m "$(cat <<'EOF'
Document cancelled-event display and admin cancel flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8.5: Open PR (only if user has explicitly asked for one)**

Per the project's git safety conventions, do not push or open a PR without explicit user direction. When asked:

```bash
gh pr create --title "Display cancelled events on the public calendar" --body "$(cat <<'EOF'
## Summary
- Cancelled future events stay visible on the public calendar (list + grid) with a Cancelled badge, muted styling, and no Register button.
- `/register/[slug]` shows a destructive banner for cancelled events, hides the registration CTA, and keeps the description visible so the admin's cancellation note is the first thing riders read.
- iCal subscribers see `STATUS:CANCELLED` propagate to their personal calendars.
- Admin cancel modal now always opens and prompts for an updated event description so the admin is nudged to write a rider-facing cancellation note in the same step.

Spec: `docs/superpowers/specs/2026-05-23-cancelled-events-display-design.md`
Plan: `docs/superpowers/plans/2026-05-23-cancelled-events-display.md`

## Test plan
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Manual: cancel a future event in the admin UI; confirm the modal opens with the existing description pre-filled
- [ ] Manual: confirm the cancelled event still shows on `/calendar` (list and grid) with the badge and no Register button
- [ ] Manual: confirm `/register/<cancelled-slug>` shows the banner, hides the form, and renders the description
- [ ] Manual: subscribe to the iCal feed in a calendar app; confirm the cancelled event renders as cancelled

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage check:**

- Public list queries widened — Task 1 ✓
- `Event` and `EventDetails` types gain `status` — Task 1 ✓
- iCal feed with `STATUS:CANCELLED` — Task 2 ✓
- Event card cancelled variant — Task 3 ✓
- Calendar grid cancelled variant — Task 4 ✓
- Registration page banner + hidden CTA + JSON-LD — Task 5 ✓
- `updateEventStatus` accepts description — Task 6 ✓
- `EventStatusSelect` always-open modal with textarea — Task 7 ✓
- `initialDescription` prop plumbed from admin page — Task 7 ✓
- Tests for each surface — Tasks 1, 2, 3, 4, 6, 7 ✓
- Docs — Task 8 ✓

**Type consistency:**

- `status: 'scheduled' | 'cancelled'` used consistently on `Event` (Task 1) and `EventDetails` (Task 1).
- `initialDescription: string | null` consistent between `EventStatusSelect` prop (Task 7.3), admin page invocation (Task 7.4), and test fixtures (Task 7.1).
- Action signature `updateEventStatus(eventId, status, options?: { description?: string | null })` consistent across action definition (Task 6.3), test invocation (Task 6.1), and component call site (Task 7.3).

**No placeholders.** Every step has the actual code or command to run.
