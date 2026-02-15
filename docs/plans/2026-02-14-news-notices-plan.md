# News & Notices Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to publish news/notice items that display as compact, expandable cards in the homepage sidebar.

**Architecture:** New `news` table in Supabase, server actions for CRUD, data queries for reads, admin pages for management, and a homepage sidebar component with accordion expand. Follows existing patterns: `lib/actions/` for writes, `lib/data/` for reads, `components/admin/` for admin UI.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), TypeScript, Tailwind CSS 4, shadcn/ui, react-markdown

---

### Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260215120000_add_news_table.sql`

**Step 1: Write the migration**

```sql
-- Create news table for homepage notices/announcements
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for homepage query: published items sorted by sort_order, created_at
create index idx_news_published on public.news (is_published, sort_order, created_at desc);

-- RLS policies
alter table public.news enable row level security;

-- Public can read published news items
create policy "Public can read published news"
  on public.news for select
  using (is_published = true);

-- Service role (admin) can do everything (bypasses RLS via supabase-server.ts)
```

**Step 2: Apply the migration**

Run: `npx supabase migration up` (or `npx supabase db reset` if the user approves)

**Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --local > types/supabase.ts`

**Step 4: Commit**

```bash
git add supabase/migrations/20260215120000_add_news_table.sql types/supabase.ts
git commit -m "feat: add news table with RLS policies"
```

---

### Task 2: Audit log and type updates

**Files:**

- Modify: `lib/audit-log.ts:2` — add `'news'` to `AuditEntityType`
- Modify: `types/queries.ts` — add `NewsItem` type

**Step 1: Add 'news' to AuditEntityType**

In `lib/audit-log.ts`, change:

```typescript
export type AuditEntityType = 'event' | 'route' | 'rider' | 'result' | 'page' | 'admin_user'
```

to:

```typescript
export type AuditEntityType =
  | 'event'
  | 'route'
  | 'rider'
  | 'result'
  | 'page'
  | 'admin_user'
  | 'news'
```

**Step 2: Add NewsItem type to types/queries.ts**

Add at the end of the file:

```typescript
/**
 * News item for admin list
 */
export type NewsItem = Database['public']['Tables']['news']['Row']

/**
 * News item insert type
 */
export type NewsInsert = Database['public']['Tables']['news']['Insert']

/**
 * News item update type
 */
export type NewsUpdate = Database['public']['Tables']['news']['Update']
```

**Step 3: Commit**

```bash
git add lib/audit-log.ts types/queries.ts
git commit -m "feat: add news to audit entity types and query types"
```

---

### Task 3: Data queries

**Files:**

- Create: `lib/data/news.ts`

**Step 1: Write getPublishedNews and getAllNews**

```typescript
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { handleDataError } from '@/lib/errors'
import type { NewsItem } from '@/types/queries'

/**
 * Get published news items for homepage display.
 * Ordered by sort_order ascending (lower = higher), then created_at descending.
 */
export const getPublishedNews = cache(async (): Promise<NewsItem[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await getSupabase()
        .from('news')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        return handleDataError(error, { operation: 'getPublishedNews' }, [])
      }

      return data ?? []
    },
    ['published-news'],
    { revalidate: 60, tags: ['news'] }
  )()
})

/**
 * Get all news items for admin list.
 * Ordered by created_at descending (newest first).
 */
export async function getAllNews(): Promise<NewsItem[]> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-server')

  const { data, error } = await getSupabaseAdmin()
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return handleDataError(error, { operation: 'getAllNews' }, [])
  }

  return data ?? []
}

/**
 * Get a single news item by ID (for admin edit page).
 */
export async function getNewsItem(id: string): Promise<NewsItem | null> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-server')

  const { data, error } = await getSupabaseAdmin().from('news').select('*').eq('id', id).single()

  if (error) {
    return handleDataError(error, { operation: 'getNewsItem' }, null)
  }

  return data
}
```

**Step 2: Commit**

```bash
git add lib/data/news.ts
git commit -m "feat: add news data queries"
```

---

### Task 4: Server actions

**Files:**

- Create: `lib/actions/news.ts`

**Step 1: Write create, update, delete actions**

```typescript
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

interface NewsItemInput {
  title: string
  body: string
  is_published: boolean
  sort_order: number
}

function revalidateNews() {
  revalidateTag('news')
  revalidatePath('/')
  revalidatePath('/admin/news')
}

export async function createNewsItem(input: NewsItemInput): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin()

    const { data, error } = await getSupabaseAdmin()
      .from('news')
      .insert({
        title: input.title.trim(),
        body: input.body.trim(),
        is_published: input.is_published,
        sort_order: input.sort_order,
        created_by: admin.id,
      })
      .select('id')
      .single()

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'createNewsItem' },
        'Failed to create news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'news',
      entityId: data.id,
      description: `Created news item: ${input.title}`,
    })

    revalidateNews()
    return createActionResult({ id: data.id })
  } catch (error) {
    return handleActionError(error, { operation: 'createNewsItem' }, 'Failed to create news item')
  }
}

export async function updateNewsItem(id: string, input: NewsItemInput): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    const { error } = await getSupabaseAdmin()
      .from('news')
      .update({
        title: input.title.trim(),
        body: input.body.trim(),
        is_published: input.is_published,
        sort_order: input.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'updateNewsItem' },
        'Failed to update news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'news',
      entityId: id,
      description: `Updated news item: ${input.title}`,
    })

    revalidateNews()
    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'updateNewsItem' }, 'Failed to update news item')
  }
}

export async function deleteNewsItem(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    // Fetch title before deleting for audit log
    const { data: item } = await getSupabaseAdmin()
      .from('news')
      .select('title')
      .eq('id', id)
      .single()

    const { error } = await getSupabaseAdmin().from('news').delete().eq('id', id)

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'deleteNewsItem' },
        'Failed to delete news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'delete',
      entityType: 'news',
      entityId: id,
      description: `Deleted news item: ${item?.title ?? id}`,
    })

    revalidateNews()
    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'deleteNewsItem' }, 'Failed to delete news item')
  }
}
```

**Step 2: Commit**

```bash
git add lib/actions/news.ts
git commit -m "feat: add news CRUD server actions"
```

---

### Task 5: Admin sidebar navigation

**Files:**

- Modify: `components/admin/sidebar.tsx`

**Step 1: Add Megaphone import**

Add `Megaphone` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Users,
  UserCog,
  Calendar,
  Route,
  Trophy,
  LogOut,
  FileText,
  ScrollText,
  Settings,
  Megaphone,
} from 'lucide-react'
```

**Step 2: Add News to mainNavItems**

After the Results entry in `mainNavItems`, add:

```typescript
{
  title: 'News',
  href: '/admin/news',
  icon: Megaphone,
  testId: 'nav-news',
},
```

**Step 3: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat: add News to admin sidebar navigation"
```

---

### Task 6: News editor component

**Files:**

- Create: `components/admin/news-editor.tsx`

**Step 1: Create the news editor form component**

Model after `components/admin/page-editor.tsx` but adapted for news fields (title, body, sort_order, is_published). Use dynamic import for MarkdownEditor. Include a switch toggle for published state.

Key differences from PageEditor:

- No slug or description fields
- No header image picker
- Add sort_order number input
- Add is_published Switch toggle
- Calls `createNewsItem` / `updateNewsItem` instead of `savePage`
- Redirect to `/admin/news` list after create

**Step 2: Commit**

```bash
git add components/admin/news-editor.tsx
git commit -m "feat: add news editor component"
```

---

### Task 7: Admin news list page

**Files:**

- Create: `app/admin/news/page.tsx`

**Step 1: Create the list page**

Model after `app/admin/pages/page.tsx`. Server component that:

- Calls `requireAdmin()` for auth
- Calls `getAllNews()` for data
- Renders a table with columns: Title, Status (badge: "Published" green / "Draft" gray), Sort Order, Created date
- Uses `ClickableTableRow` linking to `/admin/news/[id]`
- "New Item" button top-right linking to `/admin/news/new`
- Empty state with Megaphone icon

**Step 2: Commit**

```bash
git add app/admin/news/page.tsx
git commit -m "feat: add admin news list page"
```

---

### Task 8: Admin news create page

**Files:**

- Create: `app/admin/news/new/page.tsx`

**Step 1: Create the new news page**

Model after `app/admin/pages/new/page.tsx`:

- Server component with `requireAdmin()`
- Back button to `/admin/news`
- Renders `<NewsEditor isNew />`
- Uses dynamic import for NewsEditor

**Step 2: Commit**

```bash
git add app/admin/news/new/page.tsx
git commit -m "feat: add admin news create page"
```

---

### Task 9: Admin news edit page

**Files:**

- Create: `app/admin/news/[id]/page.tsx`

**Step 1: Create the edit news page**

Model after `app/admin/pages/[slug]/page.tsx`:

- Server component with `requireAdmin()`
- Fetches news item via `getNewsItem(id)`
- Returns `notFound()` if not found
- Back button to `/admin/news`
- Renders `<NewsEditor>` with initial values from the fetched item

**Step 2: Commit**

```bash
git add app/admin/news/[id]/page.tsx
git commit -m "feat: add admin news edit page"
```

---

### Task 10: Admin news delete functionality

**Files:**

- Modify: `app/admin/news/[id]/page.tsx` or create `components/admin/news-delete-button.tsx`

**Step 1: Add delete button to the edit page**

Add a delete button (with confirmation dialog) to the news edit page. Use shadcn AlertDialog for the "Are you sure?" confirmation. On confirm, call `deleteNewsItem(id)` and redirect to `/admin/news`.

This can be a small client component (`NewsDeleteButton`) rendered on the edit page, or integrated into the NewsEditor component.

**Step 2: Commit**

```bash
git add components/admin/news-delete-button.tsx app/admin/news/[id]/page.tsx
git commit -m "feat: add news item delete with confirmation"
```

---

### Task 11: Homepage NewsSection component

**Files:**

- Create: `components/news-section.tsx`

**Step 1: Create the NewsSection component**

Client component (`'use client'`) with accordion behavior:

- Receives `items` prop (array of `{ id, title, body, created_at }`)
- If items is empty, returns `null` (no render)
- Section heading: "News & Notices" in serif h2 matching sidebar style
- Each item renders as a compact card:
  - Title: `font-serif text-sm font-medium` — clickable to toggle expand
  - Date: `text-xs text-muted-foreground` formatted as "Feb 14, 2026"
  - Teaser: first ~100 chars of body stripped to plain text, `text-xs text-muted-foreground`, shown when collapsed
- When expanded, show full rendered markdown body using `MarkdownContent` component (dynamic import to keep bundle small)
- Only one item expanded at a time (clicking another collapses the current)
- Subtle expand/collapse animation (height transition)

**Step 2: Commit**

```bash
git add components/news-section.tsx
git commit -m "feat: add homepage NewsSection component"
```

---

### Task 12: Integrate NewsSection into homepage

**Files:**

- Modify: `app/page.tsx`

**Step 1: Add NewsSection to the sidebar**

Import `getPublishedNews` from `lib/data/news` and `NewsSection` from `components/news-section`.

In the sidebar div (the `lg:w-80` div), add `<NewsSection>` above `<MyRidesSection />`. Since `getPublishedNews` is async, fetch the data at the page level and pass it as props.

The page component needs to become `async` (add `async` to `export default function Page()`).

```tsx
import { getPublishedNews } from '@/lib/data/news'
import { NewsSection } from '@/components/news-section'

export default async function Page() {
  const heroImages = getHeroImages()
  const newsItems = await getPublishedNews()

  return (
    <PageShell>
      <Hero images={heroImages} />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col gap-16 lg:flex-row lg:gap-20">
          {/* Main content — unchanged */}
          <div className="flex-1 min-w-0">{/* ... existing content ... */}</div>

          {/* Sidebar */}
          <div className="lg:w-80 lg:shrink-0 lg:border-l lg:border-border lg:pl-12">
            <NewsSection items={newsItems} />
            <MyRidesSection />
            <UpcomingRides />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add NewsSection to homepage sidebar"
```

---

### Task 13: Reduce Upcoming Rides to 3 per chapter

**Files:**

- Modify: `components/upcoming-rides.tsx`

**Step 1: Trim each chapter's rides array to 3**

In the `UpcomingRides` component, change the rides array for each chapter from 4 items to 3. Since the data is currently hardcoded, simply remove the 4th ride from each chapter's array.

Alternatively, if we want to keep the data intact and just display 3, slice in the render:

```tsx
{chapter.rides.slice(0, 3).map((ride, index) => {
```

The `.slice(0, 3)` approach is better — it's forward-compatible with when rides come from the database.

**Step 2: Commit**

```bash
git add components/upcoming-rides.tsx
git commit -m "feat: reduce upcoming rides to 3 per chapter"
```

---

### Task 14: E2E test for admin news workflow

**Files:**

- Modify: `tests/e2e/admin-workflows.spec.ts`

**Step 1: Add news management test**

Add a new `test.describe('News Management')` block to the existing admin workflows E2E test file. The test should:

1. Log in as admin
2. Navigate to `/admin/news`
3. Click "New Item"
4. Fill in title, body, toggle published
5. Save
6. Verify redirect to edit page
7. Navigate to homepage, verify news item appears in sidebar
8. Go back to admin, unpublish the item
9. Navigate to homepage, verify it no longer appears

Guard with `test.skip()` if no E2E admin credentials are configured (same pattern as existing tests).

**Step 2: Commit**

```bash
git add tests/e2e/admin-workflows.spec.ts
git commit -m "test: add E2E test for news management workflow"
```

---

### Task 15: Documentation

**Files:**

- Modify: `docs/ARCHITECTURE.md` — add news section
- Modify: `docs/DATA_LAYER.md` — add news queries/actions

**Step 1: Update architecture docs**

Add a brief section about the news feature to `docs/ARCHITECTURE.md` describing the table, admin UI, and homepage integration.

Add news queries and actions to `docs/DATA_LAYER.md` following the existing format for other entities.

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DATA_LAYER.md
git commit -m "docs: add news feature to architecture and data layer docs"
```

---

### Task 16: Final verification

**Step 1: Run the full test suite**

Run: `npm run build` — verify no TypeScript errors
Run: `npm run lint` — verify no lint errors
Run: `npx playwright test tests/e2e/admin-workflows.spec.ts` — verify E2E passes (if credentials configured)

**Step 2: Manual smoke test**

1. Start dev server: `npm run dev`
2. Go to `/admin/news` — verify list page loads
3. Create a news item, toggle published
4. Go to homepage — verify item appears in sidebar
5. Click to expand — verify markdown renders
6. Go back to admin, unpublish — verify homepage no longer shows it

**Step 3: Final commit if any fixes needed**
