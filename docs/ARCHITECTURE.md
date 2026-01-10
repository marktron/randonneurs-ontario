# Architecture Overview

This document provides a high-level overview of the Randonneurs Ontario codebase architecture for new developers joining the project.

## What is Randonneurs Ontario?

Randonneurs Ontario is a volunteer-run organization dedicated to **randonneuring** - non-competitive, long-distance cycling. This website serves as the central hub for:

- **Event calendars** for 4 regional chapters (Toronto, Ottawa, Simcoe-Muskoka, Huron)
- **Route information** with RideWithGPS integration
- **Event registration** for scheduled and permanent rides
- **Historical results** tracking and rider profiles
- **Admin dashboard** for event organizers

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 16 (App Router) | React meta-framework with server-side rendering |
| **Language** | TypeScript | Type-safe JavaScript |
| **Database** | Supabase (PostgreSQL) | Hosted database with authentication |
| **Styling** | Tailwind CSS 4 | Utility-first CSS framework |
| **UI Components** | shadcn/ui + Radix UI | Accessible component library |
| **Email** | SendGrid | Transactional emails for registration |
| **Maps** | RideWithGPS | Route maps and cue sheets |

## Directory Structure

```
randonneurs-ontario/
├── app/                      # Next.js App Router (pages & API routes)
│   ├── admin/                # Protected admin dashboard
│   ├── calendar/[chapter]/   # Chapter event calendars
│   ├── routes/[chapter]/     # Route listings
│   ├── results/[year]/       # Historical results
│   ├── register/             # Event registration
│   ├── riders/[slug]/        # Rider profiles
│   └── page.tsx              # Homepage
│
├── components/               # React components
│   ├── admin/                # Admin-specific components
│   ├── ui/                   # shadcn/ui primitive components
│   └── *.tsx                 # Page-level components
│
├── lib/                      # Core logic & utilities
│   ├── actions/              # Server actions (write operations)
│   ├── data/                 # Data fetching (read operations)
│   ├── email/                # Email templates and sending
│   ├── auth/                 # Authentication utilities
│   ├── supabase*.ts          # Database client configurations
│   └── *.ts                  # Utility functions
│
├── types/                    # TypeScript type definitions
│   └── supabase.ts           # Generated database types
│
├── supabase/                 # Database configuration
│   ├── migrations/           # SQL schema migrations
│   └── seed.sql              # Development seed data
│
├── content/                  # Static content
│   └── pages/                # Markdown content for CMS pages
│
├── hooks/                    # React custom hooks
├── public/                   # Static assets (images)
└── docs/                     # Project documentation
```

## Key Architectural Concepts

### 1. Server Components vs Client Components

Next.js 16 uses React Server Components by default. This means:

- **Server Components** (default): Render on the server, can directly access the database
- **Client Components** (marked with `'use client'`): Run in the browser, needed for interactivity

```tsx
// Server Component (default) - can fetch data directly
export default async function CalendarPage() {
  const events = await getEventsByChapter('toronto')  // Direct DB access
  return <EventList events={events} />
}

// Client Component - for interactive features
'use client'
export function RegistrationForm() {
  const [name, setName] = useState('')  // Browser-only state
  // ...
}
```

### 2. Server Actions

Server Actions are async functions that run on the server but can be called from the client. They're used for all data mutations (creates, updates, deletes).

Located in: `lib/actions/`

```tsx
// lib/actions/register.ts
'use server'

export async function registerForEvent(data: RegistrationData) {
  // This runs on the server
  // Can access database, send emails, etc.
}
```

### 3. Data Layer Pattern

The codebase separates **reads** from **writes**:

| Folder | Purpose | Example |
|--------|---------|---------|
| `lib/data/` | Read operations (queries) | `getEventsByChapter()` |
| `lib/actions/` | Write operations (mutations) | `registerForEvent()` |

This separation makes it easy to understand data flow and apply caching.

### 4. Supabase Clients

There are multiple Supabase clients for different use cases:

| Client | File | Use Case |
|--------|------|----------|
| `getSupabase()` | `lib/supabase.ts` | Public reads (respects RLS) |
| `createSupabaseServerClient()` | `lib/supabase-server-client.ts` | Server components with auth |
| `getSupabaseAdmin()` | `lib/supabase-server.ts` | Server actions (bypasses RLS) |

**Rule of thumb:** Use `getSupabase()` for reading public data, `getSupabaseAdmin()` for writes.

### 5. Chapter-Based Organization

The site is organized around 4 regional chapters:

- **Toronto** - GTA and Niagara
- **Ottawa** - Eastern Ontario
- **Simcoe-Muskoka** - Georgian Bay and Kawarthas
- **Huron** - Southwestern Ontario

The `lib/chapter-config.ts` file is the single source of truth for chapter metadata.

## Data Flow Diagrams

### Event Registration Flow

```
User fills form → Client Component
       ↓
Form submitted → Server Action (registerForEvent)
       ↓
   ┌───┴───┐
   ↓       ↓
Find/Create   Check event
  Rider        status
   ↓           ↓
   └───┬───────┘
       ↓
Create Registration
       ↓
Send Confirmation Email (async)
       ↓
Revalidate Cache → Updated UI
```

### Page Rendering Flow

```
User visits /calendar/toronto
       ↓
Next.js App Router matches route
       ↓
Server Component renders
       ↓
getEventsByChapter('toronto') called
       ↓
Supabase query executed
       ↓
HTML streamed to browser
       ↓
Client components hydrate
```

## Authentication Model

This site has a **split authentication model**:

- **Riders**: No accounts needed - they register with name/email
- **Admins**: Use Supabase Auth (email/password) for the admin dashboard

Admin roles:
- `admin` - Full access to all chapters
- `chapter_admin` - Scoped to their chapter only

## Key Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration |
| `tailwind.config.ts` | Tailwind CSS customization |
| `components.json` | shadcn/ui component settings |
| `supabase/config.toml` | Local Supabase settings |
| `.env.local` | Environment variables (secrets) |

## Common Patterns

### Fetching Data in Server Components

```tsx
// app/calendar/[chapter]/page.tsx
export default async function CalendarPage({
  params
}: {
  params: Promise<{ chapter: string }>
}) {
  const { chapter } = await params
  const events = await getEventsByChapter(chapter)

  return <CalendarView events={events} />
}
```

### Handling Form Submissions

```tsx
// components/registration-form.tsx
'use client'

export function RegistrationForm({ eventId }: { eventId: string }) {
  async function handleSubmit(formData: FormData) {
    const result = await registerForEvent({
      eventId,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
    })

    if (!result.success) {
      toast.error(result.error)
    }
  }

  return <form action={handleSubmit}>...</form>
}
```

### Using UI Components

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function EventCard({ event }: { event: Event }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{event.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={`/register/${event.slug}`}>Register</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
```

## Related Documentation

- [Getting Started Guide](./GETTING_STARTED.md) - Setup and first steps
- [Data Layer Guide](./DATA_LAYER.md) - Database and data fetching details
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute code
- [Database Schema](./database-schema-plan.md) - Database design
- [Style Guide](./style_guide.md) - UI/UX design guidelines
