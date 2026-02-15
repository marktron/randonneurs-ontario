# News & Notices Feature Design

## Overview

Add the ability for admins to publish news items (announcements, notices) that display on the homepage sidebar. Replaces the "Notices" section from the old randonneursontario.ca site.

## Decisions

| Aspect         | Decision                                         |
| -------------- | ------------------------------------------------ |
| Storage        | Supabase `news` table                            |
| Content format | Markdown (reuse existing editor)                 |
| Scope          | Org-wide, no chapter scoping                     |
| Permissions    | All admins (admin + chapter_admin)               |
| Admin UI       | List + create/edit pages at `/admin/news`        |
| Homepage       | Compact cards in sidebar, click to expand inline |
| Expiry         | Manual publish/unpublish only                    |
| Archive page   | None (homepage only for now)                     |

## Data Model

### `news` table

| Column         | Type        | Notes                             |
| -------------- | ----------- | --------------------------------- |
| `id`           | uuid        | PK, default `gen_random_uuid()`   |
| `title`        | text        | Required                          |
| `body`         | text        | Markdown content                  |
| `is_published` | boolean     | Default false                     |
| `sort_order`   | integer     | Default 0. Lower = higher on page |
| `created_by`   | uuid        | FK to `admins.id`                 |
| `created_at`   | timestamptz | Default `now()`                   |
| `updated_at`   | timestamptz | Default `now()`                   |

RLS: public read for published items, admin-only writes.

Add `'news'` to the `AuditEntityType` union in `lib/audit-log.ts`.

## Admin UI

### Navigation

Add "News" to `mainNavItems` in the admin sidebar (visible to all admins). Icon: `Megaphone` from lucide-react. Positioned after "Results".

### List page (`/admin/news`)

- Table columns: Title, Status (published/draft badge), Sort Order, Created, Actions
- "New Item" button top-right
- Edit/delete actions per row
- No filters or search (small number of items)

### Create/Edit page (`/admin/news/new` and `/admin/news/[id]`)

- Fields: Title (text input), Body (MarkdownEditor with file upload), Sort order (number, default 0), Published (toggle)
- Save triggers server action + audit log

## Server Actions (`lib/actions/news.ts`)

- `createNewsItem(input)` — insert + audit log
- `updateNewsItem(id, input)` — update + audit log
- `deleteNewsItem(id)` — delete + audit log

## Data Queries (`lib/data/news.ts`)

- `getPublishedNews()` — published items ordered by `sort_order` asc, `created_at` desc (for homepage)
- `getAllNews()` — all items ordered by `created_at` desc (for admin list)

## Homepage Display

### NewsSection component

- Placed in sidebar **above** MyRidesSection and UpcomingRides
- Each item renders as a compact card:
  - Title: serif font, text-sm, font-medium
  - Date: muted, text-xs (e.g. "Feb 14, 2026")
  - Teaser: first ~100 chars of body, stripped to plain text, text-xs, muted, truncated with ellipsis
- Clicking a card expands it inline (accordion-style) to show the full rendered markdown
- If no published items exist, the section doesn't render (no empty state)

### Upcoming Rides change

Reduce from 4 rides per chapter to 3. Each chapter already has a "View all" link.

### Sidebar order

1. News & Notices
2. My Rides
3. Upcoming Rides (3 per chapter)

## Testing

- Unit tests for server actions: `lib/actions/news.test.ts`
- Unit tests for data queries: `lib/data/news.test.ts`
- E2E test: admin creates item, verify it appears on homepage, unpublish, verify it disappears
