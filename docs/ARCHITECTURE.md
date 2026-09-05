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

| Layer             | Technology              | Purpose                                         |
| ----------------- | ----------------------- | ----------------------------------------------- |
| **Framework**     | Next.js 16 (App Router) | React meta-framework with server-side rendering |
| **Language**      | TypeScript              | Type-safe JavaScript                            |
| **Database**      | Supabase (PostgreSQL)   | Hosted database with authentication             |
| **Styling**       | Tailwind CSS 4          | Utility-first CSS framework                     |
| **UI Components** | shadcn/ui + Radix UI    | Accessible component library                    |
| **Email**         | Amazon SES              | Transactional emails for registration           |
| **Maps**          | RideWithGPS             | Route maps and cue sheets                       |

## Directory Structure

```
randonneurs-ontario/
├── app/                      # Next.js App Router (pages & API routes)
│   ├── account/              # Optional rider sign-in area (docs/rider-accounts.md)
│   ├── admin/                # Protected admin dashboard
│   │   ├── settings/         # Admin profile & password management
│   │   └── users/            # Admin user management (super admin only)
│   ├── api/                  # API routes
│   │   └── calendar/         # iCal feeds for calendar subscriptions
│   ├── calendar/[chapter]/   # Chapter event calendars
│   ├── routes/                # Route library index, linking each chapter
│   │   └── [chapter]/         # Route listings
│   ├── results/[year]/       # Historical results
│   ├── register/             # Event registration
│   ├── riders/[slug]/        # Rider profiles
│   └── page.tsx              # Homepage
│
├── components/               # React components
│   ├── account/               # Rider sign-in/settings form building blocks (docs/rider-accounts.md)
│   ├── admin/                # Admin-specific components
│   ├── registration/         # Shared registration form building blocks (docs/registration-forms.md)
│   ├── ui/                   # shadcn/ui primitive components
│   └── *.tsx                 # Page-level components
│
├── lib/                      # Core logic & utilities
│   ├── account/               # Rider linking, "My rides", deletion (docs/rider-accounts.md)
│   ├── actions/              # Server actions (write operations)
│   ├── data/                 # Data fetching (read operations)
│   ├── email/                # Email templates and sending
│   ├── auth/                 # Authentication utilities
│   ├── supabase*.ts          # Database client configurations
│   ├── registration-storage.ts # Shared `ro-registration` localStorage record (docs/registration-forms.md)
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
│   ├── pages/                # Markdown content for CMS pages
│   └── navigation.json       # Site navigation structure
│
├── hooks/                    # React custom hooks
│   └── use-registration-form.ts  # Shared registration form state (docs/registration-forms.md)
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
  const events = await getEventsByChapter('toronto') // Direct DB access
  return <EventList events={events} />
}

// Client Component - for interactive features
;('use client')
export function RegistrationForm() {
  const [name, setName] = useState('') // Browser-only state
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

| Folder         | Purpose                      | Example                |
| -------------- | ---------------------------- | ---------------------- |
| `lib/data/`    | Read operations (queries)    | `getEventsByChapter()` |
| `lib/actions/` | Write operations (mutations) | `registerForEvent()`   |

This separation makes it easy to understand data flow and apply caching.

### 4. Supabase Clients

There are multiple Supabase clients for different use cases:

| Client                         | File                            | Use Case                      |
| ------------------------------ | ------------------------------- | ----------------------------- |
| `getSupabase()`                | `lib/supabase.ts`               | Public reads (respects RLS)   |
| `createSupabaseServerClient()` | `lib/supabase-server-client.ts` | Server components with auth   |
| `getSupabaseAdmin()`           | `lib/supabase-server.ts`        | Server actions (bypasses RLS) |

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

### Result Submission Flow

After an event's closing time passes, riders can self-submit their results:

```
Event closes (cron or manual status change)
       ↓
Create pending results for registered riders
       ↓
Send email with unique submission link
       ↓
Rider visits /results/submit/[token]
       ↓
Rider submits: status, finish clock time + day, Strava link, GPX, control card photos
       ↓
Form computes elapsed time from event start, warns if past the ACP cutoff
       ↓
Server Action (submitRiderResult) validates & saves elapsed time as INTERVAL
       ↓
Admin reviews in /admin/events/[id]
       ↓
Admin submits final results to ACP
```

**Key components:**

- `lib/events/complete-event.ts` - Creates pending results and sends emails. Also sends the submission email to registered riders who already hold a `pending`, un-submitted results row (e.g. a card pre-fill reverted by an undo before the event closed) — not just riders it creates a fresh row for — reusing or backfilling that row's `submission_token` (backfill filtered to a row still `pending` with no `submitted_at`, so a concurrently-finalized row can't be stamped). Every send, from either loop, is gated by an atomic claim on `results.submission_email_sent_at` (update-where-null; distinct from `finish_email_sent_at`) so re-running this function never double-emails a rider; `send-result-reminders.ts` intentionally ignores this column since re-sending is its job
- `lib/events/send-result-reminders.ts` - Re-sends the submission email (reminder variant) to registered riders whose result is still pending; triggered by the "Send Reminders" button on `/admin/events/[id]` for completed events (cancelled registrations excluded). Also sends a track-only reminder to digital-card riders whose result is `finished` (pre-filled from their final check-in) but still missing a Strava link/GPX file, provided their registration has at least one `control_checkins` row. Any rider whose result already has `submitted_at` set is skipped for both reminder kinds. The run is all-or-nothing: a `control_checkins` fetch error is retried once, and if the retry also fails the whole run sends nothing and records the error, rather than partially sending pending-submission reminders — this flow has no per-rider send-marker, so a partial send would let an admin retry double-email pending riders — see `docs/digital-brevet-card.md`
- `lib/events/finish-result.ts` - Pre-fills a rider's result (`status`, `finish_time`, `prefilled_at`) from their final-control check-in and sends the one-time "add your ride track" email (`results.finish_email_sent_at` guard), linking the claimed row's own `submission_token`. `prefilled_at` is the provenance marker distinguishing card writes from admin/rider ones: admin `updateResult` and rider `submitRiderResult` both clear it, and only a row with `prefilled_at` still set can be reverted by a check-in undo — an admin-entered or admin/rider-corrected row is never touched. A retried check-in (a crash between the pre-fill insert and the email claim) re-enters the card's own prior pre-fill — a `finished` row with `prefilled_at` still set — instead of being rejected as already-finished, then always proceeds to the email claim; `finish_email_sent_at` keeps that retry safe even if the email already sent. Neither function queries `event_controls` itself; the caller (`lib/actions/brevet-card.ts`) decides `isFinalControl` and passes it in, folded into a query it already makes rather than an extra sequential round trip
- `lib/email/send-result-submission-email.ts` / `lib/email/send-ride-complete-email.ts` - Builders/senders for the submission email and the finish-flow "add your ride track" email (and their reminder variants); both delegate their shared scaffolding (VP reply-to, `isEmailConfigured` guard, send + error mapping) to `lib/email/send-result-flow-email.ts`
- `lib/actions/rider-results.ts` - Handles rider submissions and file uploads
- `components/result-submission-form.tsx` - Rider-facing submission form. Shows the "Previously Submitted" banner (not the "Almost done — add your track" nudge) whenever `submittedAt` is set, even if the result is `finished` with no track yet — the submitted confirmation always wins. The form is `noValidate` and does its own validation: desktop browsers let riders type the hour and minute into the native time input while the AM/PM segment stays a filled-looking placeholder (value stays `""`, `validity.badInput` true), and the browser's native "Invalid value" bubble doesn't explain that — so the form shows a live amber hint on a partial entry and a submit-time inline error that names AM/PM as the missing piece. Since `noValidate` also disables the native `type="url"` check, the Strava-link URL format (`validity.typeMismatch`) and the elapsed-time fallback fields are validated in `handleSubmit` as well
- `components/admin/event-results-manager.tsx` - Admin view with evidence column and "Email Participants" mailto link (BCC'd to all registered riders, subject pre-populated with event name and date)

**Security:** Each result has a unique `submission_token` (UUID). No authentication required - the token acts as a capability URL.

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

### Content Pages (Markdown CMS)

Static editorial pages (About, Rules, Origins, Your First Brevet, etc.) are markdown files in `content/pages/*.md`, rendered through the catch-all `app/[slug]/page.tsx` route (some, like About, are instead served by a dedicated static route that reads the same file — see below). Each file has YAML frontmatter plus a markdown body:

```markdown
---
title: Page Title
description: One-line summary used for <meta> and card previews.
lastUpdated: 2026-01-10
headerImage: /some-image.jpg # optional
draft: true # optional — see below
---

Markdown body content.
```

**Key files:**

- `lib/content.ts` — `getPage(slug)` (single page) and `getAllPages()` (metadata for every page, sorted by title), both reading from disk via `fs`
- `lib/actions/pages.ts` — `savePage()` server action (writes locally in development; commits via the GitHub API in production, then relies on Vercel's GitHub integration to rebuild — see `docs/2026-04-29-audit.md` for the tradeoffs of this "GitHub-as-CMS" approach)
- `app/[slug]/page.tsx` — public rendering route; calls `notFound()` when `getPage()`/`getAllPages()` don't have the slug
- `app/admin/pages/` — admin list/edit UI, built on the same `getPage()`/`getAllPages()` functions

**`draft` frontmatter flag:** set `draft: true` to keep a page out of production entirely without deleting the file. `getAllPages()` always excludes draft pages (so they never appear in listings, the admin nav-link picker, or the sitemap), and `getPage(slug)` treats a draft page as not-found whenever `NODE_ENV === 'production'` — but still renders it in development, so an author can preview work-in-progress content locally before flipping the flag off. Use this for any page that isn't ready for real users to land on; a lorem-ipsum placeholder (`content/pages/test-page.md`) shipped live at `/test-page` and in the sitemap before this flag existed, which is why it exists now.

**`lastModified` for the sitemap:** `getAllPages()` also computes `lastModifiedDate` per page — the frontmatter `lastUpdated` date when present, otherwise the markdown file's mtime — consumed by `app/sitemap.ts` for the page's `lastModified` field.

### Site Navigation

The site navigation is data-driven, stored as `content/navigation.json` and managed via the admin tool at `/admin/navigation`.

```
Admin edits nav in /admin/navigation
       ↓
saveNavigation() server action
       ↓
   ┌───┴───────────┐
   ↓               ↓
Development:    Production:
Save locally    GitHub API commit
                   ↓
              Vercel rebuild
       ↓
getResolvedNavigation() resolves templates (client-safe, JSON import)
       ↓
PageShell passes resolved items to Navbar
       ↓
Navbar renders desktop + mobile nav from data
```

**Key files:**

- `content/navigation.json` — raw nav structure with template placeholders
- `lib/navigation.ts` — `getResolvedNavigation()` (client-safe, imports JSON module), plus shared template resolution helpers (`expandItem`, `resolveHref`, `getTemplateVariables`)
- `lib/content.ts` — `getNavigation()` (server-side, reads from disk via `fs`) and `getNavigationRaw()` (for admin editing)
- `lib/actions/navigation.ts` — `saveNavigation()` server action
- `components/navbar.tsx` — data-driven navbar renderer
- `components/footer.tsx` — footer, including the crawlable site-section links
- `components/admin/navigation-editor.tsx` — admin drag-and-drop editor

**Template system:** Items with `"template": "chapters"` expand into one link per chapter at read time. Variables like `{{season}}`, `{{pbpYear}}`, and `{{graniteAnvilYear}}` are resolved from environment config and computed values.

**Crawlability:** `PageShell` renders `Navbar` as a normal server-rendered import — it must not be wrapped in `dynamic(..., { ssr: false })`, or the primary navigation disappears from the server HTML on every page. Even so, the navbar's _dropdown_ links are not in the initial HTML: the desktop links live inside Radix `NavigationMenuContent` and the mobile links inside a `Sheet`, neither of which mounts its children until the user opens it. Force-mounting them would make every dropdown link permanently focusable (a keyboard/screen-reader regression) for no SEO gain, so instead `components/footer.tsx` renders a plain-`<Link>` list of every main site section on every page. That footer list is the crawl path — keep it in sync when routes are added or removed. `tests/unit/components/page-shell.test.tsx` asserts both properties against `renderToString`.

### News & Notices

The `news` table stores homepage announcements managed through `/admin/news`. Each item has a title, markdown body, publish toggle, and sort order. Published items display as compact cards in the homepage sidebar with accordion-style expansion. All admins (both `admin` and `chapter_admin` roles) can manage news items. News is org-wide (not chapter-scoped).

- **Data queries:** `lib/data/news.ts` — `getPublishedNews()`, `getAllNews()`, `getNewsItem(id)`
- **Server actions:** `lib/actions/news.ts` — `createNewsItem()`, `updateNewsItem()`, `deleteNewsItem()`
- **Admin UI:** `app/admin/news/` — list, create, edit pages
- **Homepage component:** `components/news-section.tsx`

## Authentication Model

This site has a **split authentication model**:

- **Riders**: Registration itself never required an account (name/email is
  enough). Riders can optionally sign in with a passwordless 6-digit email
  code at `/account/login`, which links to their existing rider record and
  unlocks "My rides" from any device — see `docs/rider-accounts.md`.
- **Admins**: Use Supabase Auth (email/password) for the admin dashboard

Admin roles (three-tier hierarchy):

- `super_admin` - Full access including admin user management at `/admin/users`
- `admin` - Full data management (events, routes, results, news, pages, riders, audit log) but no admin user management
- `chapter_admin` - Scoped to their chapter only

Creating a brevet dated in the current season requires `super_admin` — enforced
server-side in `createEvent` (`lib/actions/events.ts`); the admin event form
shows a confirmation dialog for super_admins and a hard-block modal for
everyone else. Editing an existing brevet's date, and creating other event
types (populaire, flèche, permanent) in the current season, is unrestricted.

Admin features:

- Login at `/admin/login`
- Settings page at `/admin/settings` for profile editing (name, phone, default chapter) and password changes
- Super admins can manage other admin users at `/admin/users`

## Scheduled Tasks

The site uses **GitHub Actions** to run scheduled tasks (cron jobs). This avoids Vercel's paid cron feature.

### Event Auto-Completion

Events are automatically marked as "completed" once their closing time passes:

```
GitHub Actions (hourly) → /api/cron/complete-events → Update event status → Send result emails
```

**Workflow:** `.github/workflows/complete-events.yml`

**How it works:**

1. GitHub Actions triggers every hour (`0 * * * *`)
2. Calls the `/api/cron/complete-events` endpoint with `CRON_SECRET` for auth
3. The endpoint checks each scheduled event's closing time (start + BRM time limit)
4. Events past their closing time are marked "completed"
5. Registered riders receive emails with links to submit their results

**Required GitHub Secrets:**

- `CRON_SECRET` - Must match the Vercel environment variable
- `SITE_URL` - Production URL (e.g., `https://randonneursontario.ca`)

**Timezone handling:** All event times are interpreted as Toronto time (`America/Toronto`), with proper EST/EDT handling via `createTorontoDate()` in `lib/brmTimes.ts`.

## On-Demand Cache Revalidation

The site provides a `POST /api/revalidate` endpoint for manually busting cached data when it goes stale outside of normal server actions (e.g., direct Supabase edits, after a deploy).

**Authentication:** Requires `REVALIDATE_SECRET` environment variable (Bearer token).

**Usage:** See [Data Layer: On-demand revalidation API](DATA_LAYER.md#on-demand-revalidation-api) for details.

## Error Monitoring

The site uses **Sentry** for error tracking and performance monitoring.

**Configuration files:**

- `instrumentation.ts` - Server-side initialization
- `instrumentation-client.ts` - Client-side initialization
- `sentry.server.config.ts` - Server config
- `sentry.edge.config.ts` - Edge runtime config

**Required Vercel environment variable:**

- `SENTRY_AUTH_TOKEN` - For source map uploads during builds

Errors are automatically captured for both client and server. View them at [sentry.io](https://sentry.io).

## Key Configuration Files

| File                   | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `next.config.ts`       | Next.js configuration (wrapped with Sentry) |
| `tailwind.config.ts`   | Tailwind CSS customization                  |
| `components.json`      | shadcn/ui component settings                |
| `supabase/config.toml` | Local Supabase settings                     |
| `.env.local`           | Environment variables (secrets)             |
| `.github/workflows/`   | GitHub Actions for scheduled tasks          |

## Common Patterns

### Fetching Data in Server Components

```tsx
// app/calendar/[chapter]/page.tsx
export default async function CalendarPage({ params }: { params: Promise<{ chapter: string }> }) {
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
