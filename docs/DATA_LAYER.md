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
const { data: events } = await getSupabase()
  .from('events')
  .select('*')
  .eq('status', 'scheduled')
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
const { data: { user } } = await supabase.auth.getUser()
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
  .insert({ event_id: '...', rider_id: '...' })
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

// Get all permanent events
export async function getPermanentEvents(): Promise<Event[]>

// Get event details by slug
export async function getEventBySlug(slug: string): Promise<EventDetails | null>

// Get registered riders for an event
export async function getRegisteredRiders(eventId: string): Promise<RegisteredRider[]>
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

### lib/data/routes.ts

```typescript
// Get routes for a chapter
export async function getRoutesByChapter(chapter: string)

// Get permanent routes
export async function getPermanentRoutes()
```

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
export async function registerForPermanent(data: PermanentRegistrationData): Promise<RegistrationResult>
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
```

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

| Table | Description |
|-------|-------------|
| `chapters` | 7 regional chapters (Toronto, Ottawa, etc.) |
| `routes` | Route definitions with RWGPS links |
| `events` | Scheduled events (brevets, populaires, etc.) |
| `riders` | Rider profiles (name, email, gender) |
| `registrations` | Event registrations |
| `results` | Completion records with finish times |
| `awards` | Award definitions |
| `result_awards` | Junction table for results ↔ awards |
| `admins` | Admin users (linked to Supabase Auth) |

### Database Views

| View | Description |
|------|-------------|
| `public_riders` | Riders without email (for public display) |
| `public_results` | Results with denormalized rider names |

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
- `public_riders` view - riders without emails

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
  return unstable_cache(
    async () => getEventBySlugInner(slug),
    [`event-by-slug-${slug}`],
    { tags: ['events', `event-${slug}`] }
  )()
}
```

The pattern combines:
- **`cache()`** - Deduplicates calls within a single request (request-level)
- **`unstable_cache()`** - Caches results across requests (cross-request caching)

### Cache Invalidation

We use `revalidatePath()` to invalidate cache after mutations:

```typescript
// lib/actions/register.ts
export async function registerForEvent(data: RegistrationData) {
  // ... create registration ...

  // Invalidate the registration page cache
  revalidatePath(`/register/${event.slug}`)

  return { success: true }
}
```

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
  .select(`
    id,
    name,
    event_date,
    chapters (name, slug),
    routes (rwgps_id, cue_sheet_url)
  `)
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
  .gte('event_date', today)          // Future events only
  .order('event_date', { ascending: true })
  .order('start_time', { ascending: true })
```

### Handling Errors

```typescript
const { data, error } = await getSupabase()
  .from('events')
  .select('*')
  .eq('slug', slug)
  .single()

if (error) {
  console.error('Error fetching event:', error)
  return null
}

return data
```

### Using RPC Functions

```typescript
const { data: riders } = await getSupabase()
  .rpc('get_registered_riders', { p_event_id: eventId })
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
