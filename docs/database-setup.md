# Database Setup

This document covers local development setup for the Supabase database.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Docker running (required for local Supabase)

## Quick Start

```bash
# Start local Supabase (first time or after stopping)
npx supabase start

# Reset database and apply all migrations + seed data
npx supabase db reset

# Stop local Supabase
npx supabase stop
```

## Database Structure

### Migrations

Located in `supabase/migrations/`. Key migrations include:

| Migration | Description |
|-----------|-------------|
| `initial_schema.sql` | Core tables (chapters, routes, events, riders, etc.) |
| `add_rls_policies.sql` | Row Level Security policies |
| `add_historical_chapters.sql` | Adds niagara, other, permanent chapters |
| `clean_event_names.sql` | Removes distance suffixes from event names |
| `add_granite_anvil_collection.sql` | Adds collection field and tags Granite Anvil events |
| `clean_route_names_and_distances.sql` | Extracts distances and cleans route names |

### Seed Data

The seed file (`supabase/seed.sql`) is automatically loaded when running `supabase db reset`. It contains:

- **7 chapters** (Toronto, Ottawa, Simcoe-Muskoka, Huron, Niagara, Other, Permanent)
- **331 routes**
- **1,605 events** (1983-2026)
- **1,130 riders**
- **9,766 results**

## Regenerating Seed Data

To capture the current database state as the new seed file:

```bash
docker exec supabase_db_randonneurs-ontario pg_dump -U postgres \
  --data-only \
  --inserts \
  --schema=public \
  postgres > supabase/seed.sql
```

Then remove the `\restrict` line if present:
```bash
sed -i '' '/^\\restrict/d' supabase/seed.sql
```

## Row Level Security (RLS)

All tables have RLS enabled. The security model:

### Public Read Access
- `chapters`, `routes`, `events`, `results`, `awards`, `result_awards` - fully public
- `public_riders` view - riders without email addresses

### Restricted Access
- `riders` table - blocked for anonymous users (use `public_riders` view instead)
- All write operations require admin authentication

### Admin Roles
- `admin` - full access to all chapters
- `chapter_admin` - scoped to their chapter only

### Helper Functions
```sql
is_admin()                      -- Returns true if current user is any admin
is_chapter_admin(chapter_id)    -- Returns true if user can admin the chapter
```

## Local Development URLs

After running `supabase start`:

| Service | URL |
|---------|-----|
| Studio (Admin UI) | http://127.0.0.1:54323 |
| REST API | http://127.0.0.1:54321/rest/v1 |
| Database | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

## API Keys

Get current keys with:
```bash
npx supabase status
```

- **Publishable key** - Safe for client-side use, respects RLS
- **Secret key** - Bypasses RLS, server-side only

## Supabase Clients

The app uses two Supabase clients:

### Public Client (`lib/supabase.ts`)
```typescript
import { supabase } from '@/lib/supabase'
```
- Uses the **anon/publishable key**
- Subject to RLS policies
- Safe to use anywhere (client or server)
- Use for: public reads, client-side queries

### Admin Client (`lib/supabase-server.ts`)
```typescript
import { supabaseAdmin } from '@/lib/supabase-server'
```
- Uses the **service role key**
- Bypasses RLS completely
- **Server-side only** (server actions, API routes)
- Use for: writes that need elevated privileges (e.g., registration)

## Common Tasks

### Create a new migration
```bash
npx supabase migration new <migration_name>
```

### View migration status
```bash
npx supabase migration list
```

### Push migrations to remote (production)
```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### Generate TypeScript types
```bash
npx supabase gen types typescript --local > types/database.ts
```
