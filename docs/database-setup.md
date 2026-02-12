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

| Migration                             | Description                                          |
| ------------------------------------- | ---------------------------------------------------- |
| `initial_schema.sql`                  | Core tables (chapters, routes, events, riders, etc.) |
| `add_rls_policies.sql`                | Row Level Security policies                          |
| `clean_event_names.sql`               | Removes distance suffixes from event names           |
| `add_granite_anvil_collection.sql`    | Adds collection field and tags Granite Anvil events  |
| `clean_route_names_and_distances.sql` | Extracts distances and cleans route names            |

### Seed Data

The seed file (`supabase/seed.sql`) is automatically loaded when running `supabase db reset`. It contains:

- **7 chapters** (Toronto, Ottawa, Simcoe-Muskoka, Huron, Niagara, Other, Permanent)
- **9 awards**
- **302 routes**
- **1,613 events** (1983-2026)
- **1,130 riders**
- **9,817 results**
- **2,277 result awards**

## Regenerating Seed Data

Use the generate-seed script to capture the current database state:

```bash
./scripts/generate-seed.sh
```

This script:

- Uses `pg_dump` from inside Docker (avoids version mismatch issues)
- Generates clean INSERT statements with column names
- Excludes the `admins` and `images` tables (they require auth.users)
- Removes problematic backslash commands that can cause syntax errors

After regenerating, test with:

```bash
npx supabase db reset
```

### Creating Admin Users After Reset

Admin users must be created after seeding since they require entries in `auth.users`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<secret-key-from-supabase-status> \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=password123 \
ADMIN_NAME="Test Admin" \
npx tsx scripts/create-admin.ts
```

## Row Level Security (RLS)

All tables have RLS enabled. The security model:

### Public Read Access

- `chapters`, `routes`, `events`, `results`, `awards`, `result_awards` - fully public
- `public_riders` view - riders without email addresses (only includes riders with at least one result)

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

| Service           | URL                            |
| ----------------- | ------------------------------ |
| Studio (Admin UI) | http://127.0.0.1:54323         |
| REST API          | http://127.0.0.1:54321/rest/v1 |

<!-- secretlint-disable @secretlint/secretlint-rule-database-connection-string -->

| Database | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

<!-- secretlint-enable @secretlint/secretlint-rule-database-connection-string -->

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
