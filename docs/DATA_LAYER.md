# Data Layer Guide

This guide explains how data flows through the Randonneurs Ontario application, including database access patterns, caching, and best practices.

## Overview

The data layer follows a clear separation:

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
├─────────────────────────────────────────────────────────┤
│  Server Components    │    Client Components            │
│  (can fetch data)     │    (use server actions)         │
├───────────────────────┼─────────────────────────────────┤
│       lib/data/       │         lib/actions/            │
│   (READ operations)   │      (WRITE operations)         │
├─────────────────────────────────────────────────────────┤
│              Supabase Clients                           │
│   getSupabase() │ createSupabaseServerClient() │        │
│                 │ getSupabaseAdmin()           │        │
├─────────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL)                      │
│        + Row Level Security (RLS) Policies              │
└─────────────────────────────────────────────────────────┘
```

## Supabase Clients Explained

We use different Supabase clients depending on the context:

### 1. `getSupabase()` - Public Client

**File:** `lib/supabase.ts`

```typescript
import { getSupabase } from '@/lib/supabase'

// Example: Fetch public event data
const { data: events } = await getSupabase().from('events').select('*').eq('status', 'scheduled')
```

**Use when:**

- Reading public data (events, routes, results)
- In server components or data fetching functions
- You want RLS (Row Level Security) policies to apply

**Don't use when:**

- Writing data (use `getSupabaseAdmin()` instead)
- Accessing private data like rider emails

### 2. `createSupabaseServerClient()` - Server Client with Auth

**File:** `lib/supabase-server-client.ts`

```typescript
import { createSupabaseServerClient } from '@/lib/supabase-server-client'

// Example: Check current user in server component
const supabase = await createSupabaseServerClient()
const {
  data: { user },
} = await supabase.auth.getUser()
```

**Use when:**

- Accessing authenticated user session in server components
- Server actions that need to know the current user
- Cookie-based authentication flows

### 3. `getSupabaseAdmin()` - Admin Client

**File:** `lib/supabase-server.ts`

```typescript
import { getSupabaseAdmin } from '@/lib/supabase-server'

// Example: Create a registration (bypasses RLS)
const { data, error } = await getSupabaseAdmin()
  .from('registrations')
  .insert({ event_id: '…', rider_id: '…' })
```

**Use when:**

- Server actions (writes/mutations)
- Accessing private data (rider emails)
- Admin operations that need to bypass RLS

**Important:** This client uses the service role key and bypasses all RLS policies. Only use in server-side code!

## Data Fetching (Reads)

All read operations live in `lib/data/`. Each file handles a specific domain:

### lib/data/events.ts

```typescript
// Get upcoming events for a chapter
export async function getEventsByChapter(urlSlug: string): Promise<Event[]>

// Get all upcoming events across all chapters (with chapter names)
export async function getAllUpcomingEvents(): Promise<Event[]>

// Get all permanent events
export async function getPermanentEvents(): Promise<Event[]>

// Get event details by slug
export async function getEventBySlug(slug: string): Promise<EventDetails | null>

// Get registered riders for an event
export async function getRegisteredRiders(eventId: string): Promise<RegisteredRider[]>

// Get existing teams for a fleche event (for join-team dropdown)
export async function getFlecheTeams(eventId: string): Promise<FlecheTeam[]>

// Get registered riders with team info for fleche events
export async function getRegisteredRidersWithTeams(eventId: string): Promise<RegisteredRider[]>
```

### lib/data/results.ts

```typescript
// Get results for a year/chapter
export async function getChapterResults(year: number, chapter: string)

// Get results for a specific rider
export async function getRiderResults(riderSlug: string)

// Get available years with results
export async function getAvailableYears(): Promise<number[]>
```

**DNS results are excluded from public output.** Both `getChapterResults` and
`getRiderResults` filter out results with `status = 'dns'` before transforming —
DNS is internal bookkeeping (who registered but never started) and is not shown
on the public results or rider pages. An event or fleche team whose only results
are DNS is omitted entirely, as is a rider-page year. DNS rows remain visible in
the admin, which queries the `results` table directly.

### lib/data/routes.ts

```typescript
// Get routes for a chapter (active routes with a map or cue sheet)
export async function getRoutesByChapter(chapter: string)

// Get a single route's details (includes cueSheetUrl)
export async function getRouteBySlug(slug: string)

// Get permanent routes
export async function getPermanentRoutes()
```

`getRoutesByChapter` returns routes that have either an RWGPS map link or a cue sheet URL (or both). `getRouteBySlug` returns a `RouteDetail` which includes `cueSheetUrl` for display on the route detail page.

### lib/data/riders.ts

```typescript
// Get all riders for the directory (sorted by last name, then first name)
export async function getAllRiders(): Promise<RiderListItem[]>
```

#### News

- `getPublishedNews()` — Published items for homepage, cached with 60s revalidation
- `getAllNews()` — All items for admin list (uses admin client)
- `getNewsItem(id)` — Single item by ID for admin edit (uses admin client)

### lib/data/event-rider-counts.ts

```typescript
// Active-rider count per event, keyed by event id
export async function getEventRiderCounts(eventIds: string[]): Promise<Record<string, number>>
```

Single source of truth for the rider counts shown in the admin area
(`/admin` dashboard and `/admin/events` list). Wraps the
`get_event_rider_counts` RPC, which counts **active** riders only:

- Registrations with status `registered` or `incomplete: membership` count.
- `cancelled` registrations are **excluded**.
- Registrations and results are merged with `COUNT(DISTINCT rider_id)`, so a
  rider who both registered and has a result is counted once.

Always use this helper for admin event rider counts. Do not re-derive counts
with an embedded `registrations (count)` select — that ignores status and sums
cancelled registrations into the total (the bug this helper consolidates away).

### Usage Pattern

```typescript
// app/calendar/[chapter]/page.tsx
import { getEventsByChapter } from '@/lib/data/events'

export default async function CalendarPage({
  params
}: {
  params: Promise<{ chapter: string }>
}) {
  const { chapter } = await params
  const events = await getEventsByChapter(chapter)

  return <EventList events={events} />
}
```

## Data Mutations (Writes)

All write operations live in `lib/actions/`. These are [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).

### lib/actions/register.ts

```typescript
// Register for a scheduled event
export async function registerForEvent(data: RegistrationData): Promise<RegistrationResult>

// Register for a permanent ride
export async function registerForPermanent(
  data: PermanentRegistrationData
): Promise<RegistrationResult>
```

### lib/actions/events.ts (Admin)

```typescript
export async function createEvent(data: EventFormData)
export async function updateEvent(id: string, data: EventFormData)
export async function deleteEvent(id: string)
```

### lib/actions/routes.ts (Admin)

```typescript
export async function createRoute(data: RouteFormData)
export async function updateRoute(id: string, data: RouteFormData)
```

### lib/actions/results.ts (Admin)

```typescript
export async function submitEventResults(eventId: string, results: ResultEntry[])

// Update team name on a registration record (fleche admin editing)
export async function updateRegistrationTeamName(
  registrationId: string,
  teamName: string | null
): Promise<ActionResult>
```

#### News (`lib/actions/news.ts`)

- `createNewsItem(input)` — Create news item with audit log
- `updateNewsItem(id, input)` — Update news item with audit log
- `deleteNewsItem(id)` — Delete news item with audit log

### lib/actions/rider-results.ts (Public - Token-based)

These actions support the rider self-service result submission flow. They use a token-based authentication system, where each result has a unique `submission_token` that is emailed to the rider after an event is completed.

`submitRiderResult` busts the results caches via the shared `revalidateResultsTags` helper (`lib/revalidate-results.ts`) — the same helper the admin results actions use, so the two write paths can never drift on which tags a results change invalidates. The file-upload actions (`confirmResultUpload`, `deleteResultFile`) deliberately do **not** revalidate: the GPX/control-card fields they mutate are not selected by any public cached read (`lib/data/results.ts`, `lib/data/routes.ts`) and are only shown in the admin.

```typescript
// Get result data by submission token (for result submission form)
export async function getResultByToken(token: string): Promise<ActionResult<ResultSubmissionData>>

// Submit rider's result (status, finish time, files, notes)
export async function submitRiderResult(input: SubmitResultInput): Promise<ActionResult>

// Mint a one-time signed upload URL for a result file. The browser uploads
// the file directly to Supabase Storage to bypass Server Action body limits.
export async function createResultUploadUrl(
  input: CreateResultUploadUrlInput
): Promise<ActionResult<CreateResultUploadUrlData>>

// Persist the file path against the result after the browser upload succeeds
export async function confirmResultUpload(
  input: ConfirmResultUploadInput
): Promise<ActionResult<{ path: string; url: string }>>

// Delete uploaded files
export async function deleteResultFile(token: string, fileType: string): Promise<ActionResult>

// Get rider's upcoming registered events (shown after result submission)
export async function getRiderUpcomingEvents(
  riderId: string
): Promise<ActionResult<UpcomingEvent[]>>

// Get upcoming events for a chapter (suggested events for riders with no upcoming registrations)
export async function getChapterUpcomingEvents(
  chapterSlug: string,
  riderId: string,
  limit?: number
): Promise<ActionResult<UpcomingEvent[]>>

// Get upcoming events from the same chapter as a given event (used after registration)
export async function getUpcomingEventsByEventId(
  eventId: string,
  limit?: number
): Promise<ActionResult<UpcomingEvent[]>>
```

Both the result submission form and registration form show upcoming events after completion:

- **Result submission form**: Shows rider's upcoming registrations, or suggests next 3 chapter events if none
- **Registration form**: Shows up to 3 upcoming events from the same chapter (not shown for permanents)

### Usage Pattern

```typescript
// components/registration-form.tsx
'use client'

import { registerForEvent } from '@/lib/actions/register'

export function RegistrationForm({ eventId }: { eventId: string }) {
  async function handleSubmit(formData: FormData) {
    const result = await registerForEvent({
      eventId,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      shareRegistration: formData.get('share') === 'on',
    })

    if (result.success) {
      toast.success('Registration confirmed!')
    } else {
      toast.error(result.error)
    }
  }

  return <form action={handleSubmit}>...</form>
}
```

## Database Schema Overview

### Core Tables

| Table           | Description                                  |
| --------------- | -------------------------------------------- |
| `chapters`      | 7 regional chapters (Toronto, Ottawa, etc.)  |
| `routes`        | Route definitions with RWGPS links           |
| `events`        | Scheduled events (brevets, populaires, etc.) |
| `riders`        | Rider profiles (name, email, gender)         |
| `registrations` | Event registrations                          |
| `results`       | Completion records with finish times         |
| `awards`        | Award definitions                            |
| `result_awards` | Junction table for results ↔ awards          |
| `admins`        | Admin users (linked to Supabase Auth)        |

### Database Views

| View             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| `public_riders`  | Riders without email, filtered to those with results (for public display) |
| `public_results` | Results with denormalized rider names                                     |

### Database Functions

```sql
-- Get registered riders for an event (respects share_registration setting)
get_registered_riders(p_event_id UUID)

-- Check if current user is an admin
is_admin() RETURNS BOOLEAN

-- Check if user can admin a specific chapter
is_chapter_admin(p_chapter_id UUID) RETURNS BOOLEAN
```

## Row Level Security (RLS)

All tables have RLS enabled. Key policies:

### Public Read Access

- `chapters`, `routes`, `events`, `results`, `awards` - anyone can read
- `public_riders` view - riders without emails (only those with at least one result)

### Protected Data

- `riders` table - blocked for anonymous (use `public_riders` instead)
- Write operations - require admin authentication

### Admin Access

- Admins can read/write everything
- Chapter admins are scoped to their chapter

## Caching & Revalidation

### Request Deduplication

All data fetching functions in `lib/data/` use React's `cache()` to deduplicate parallel calls within the same request. This prevents duplicate database queries when:

- Multiple components on the same page fetch the same data
- Both `generateMetadata()` and the page component call the same function
- Multiple server components render in parallel

```typescript
// lib/data/events.ts
const getEventBySlugInner = cache(async (slug: string) => {
  // Database query logic
})

export async function getEventBySlug(slug: string) {
  return unstable_cache(async () => getEventBySlugInner(slug), [`event-by-slug-${slug}`], {
    tags: ['events', `event-${slug}`],
  })()
}
```

The pattern combines:

- **`cache()`** - Deduplicates calls within a single request (request-level)
- **`unstable_cache()`** - Caches results across requests (cross-request caching)

### Cache Invalidation

#### Tag-based revalidation (primary approach)

All `unstable_cache()` calls include cache tags. Server actions call `revalidateTag()` after mutations to invalidate related caches:

```typescript
// lib/actions/register.ts
revalidateTag('registrations', { expire: 0 })
revalidateTag('events', { expire: 0 })
revalidateTag(`event-${event.slug}`, { expire: 0 })
```

The `{ expire: 0 }` profile is important: Next.js 16 requires a second argument
to `revalidateTag`, and passing a named profile like `'max'` only schedules a
lazy background refresh (the built-in `max` profile is 30-day revalidate,
1-year expire). Only a profile with `expire: 0` (or no profile at all) marks
the route as hard-revalidated so pages update immediately.

Top-level cache tags used across the codebase:

| Tag             | Data                      |
| --------------- | ------------------------- |
| `events`        | Event listings, calendars |
| `permanents`    | Permanent events          |
| `registrations` | Registration data         |
| `results`       | Ride results              |
| `riders`        | Rider profiles            |
| `records`       | All record types          |
| `routes`        | Route data                |
| `news`          | News/notices              |
| `chapters`      | Chapter listings          |
| `slugs`         | Event slug index          |

Dynamic tags like `event-${slug}`, `chapter-${urlSlug}`, `rider-${slug}`, and `year-${year}` provide fine-grained invalidation.

**Cross-entity invalidation:** a mutation must bust every tag under which its
data is cached, including caches owned by _other_ entities that embed it. For
example, `getEventBySlug` (`events` tag) bakes the joined route's `rwgps_id` /
`rwgps_collection_id` into its cached output, so route mutations in
`lib/actions/routes.ts` bust `events` in addition to `routes` — otherwise the
public event page (`/register/[slug]`) keeps rendering a stale RWGPS embed after
a route edit. For the same reason, `revalidateRoutesTags` always busts the
shared `routes`/`events` tags even when the route has no `chapter_id` (the
chapter-scoped `chapter-${urlSlug}` bust is the only part gated on the chapter).

#### Path-based revalidation

`revalidatePath()` is used for specific page caches:

```typescript
revalidatePath(`/register/${event.slug}`)
```

#### On-demand revalidation API

For cases where cached data goes stale outside of normal server actions (e.g., direct Supabase edits, post-deploy), use the `/api/revalidate` endpoint:

```bash
# Bust specific caches
curl -X POST https://randonneursontario.ca/api/revalidate \
  -H "Authorization: Bearer $REVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["events", "results"]}'

# Bust all caches
curl -X POST https://randonneursontario.ca/api/revalidate \
  -H "Authorization: Bearer $REVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"all": true}'
```

The endpoint validates tags against the known list above and returns `400` for unknown tags. Requires the `REVALIDATE_SECRET` environment variable.

## Type Safety

Database types are generated from the schema:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

Use these types in your code:

```typescript
import type { Database } from '@/types/supabase'

type Event = Database['public']['Tables']['events']['Row']
type EventInsert = Database['public']['Tables']['events']['Insert']
type EventUpdate = Database['public']['Tables']['events']['Update']
```

## Common Patterns

### Joining Related Data

```typescript
const { data: event } = await getSupabase()
  .from('events')
  .select(
    `
    id,
    name,
    event_date,
    chapters (name, slug),
    routes (rwgps_id, cue_sheet_url)
  `
  )
  .eq('slug', 'my-event')
  .single()

// Access joined data
const chapterName = event.chapters?.name
const rwgpsId = event.routes?.rwgps_id
```

### Filtering and Sorting

```typescript
const today = new Date().toISOString().split('T')[0]

const { data: events } = await getSupabase()
  .from('events')
  .select('*')
  .eq('chapter_id', chapterId)
  .eq('status', 'scheduled')
  .gte('event_date', today) // Future events only
  .order('event_date', { ascending: true })
  .order('start_time', { ascending: true })
```

### Handling Errors

```typescript
const { data, error } = await getSupabase().from('events').select('*').eq('slug', slug).single()

if (error) {
  console.error('Error fetching event:', error)
  return null
}

return data
```

### Using RPC Functions

```typescript
const { data: riders } = await getSupabase().rpc('get_registered_riders', { p_event_id: eventId })
```

## Best Practices

1. **Use the right client** - `getSupabase()` for reads, `getSupabaseAdmin()` for writes
2. **Type your queries** - Use generated types from `types/supabase.ts`
3. **Handle errors gracefully** - Always check for `error` in Supabase responses
4. **Revalidate after mutations** - Use `revalidatePath()` to update cached data
5. **Keep data functions focused** - One function = one purpose
6. **Use views for public data** - Use `public_riders` instead of `riders`

## Related Documentation

- [Database Schema Plan](./database-schema-plan.md) - Full schema design
- [Database Setup](./database-setup.md) - Local development setup
- [Architecture Overview](./ARCHITECTURE.md) - System architecture
