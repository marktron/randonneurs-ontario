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

The seed file (`supabase/seed.sql`) is automatically loaded when running `supabase db reset`. It contains chapters, awards, riders, routes, events, results, and result/rider awards. **PII is stripped** from this file (rider email, emergency contacts, ccn_id, birth_year are set to NULL).

The seed ends by aligning `rider_number_seq` with the seeded riders. Migrations run before the seed, so the sequence migration sees an empty `riders` table; without the trailing `setval` the first result inserted on a fresh database (CI, a new local stack) would be assigned a rider number that is already taken. It also stamps every seeded `rider_awards` and `result_awards` row as already announced (`announced_at`), because the Slack outbox migration only stamps rows that exist when it runs; without this a fresh database would announce every historical award. `scripts/generate-seed.sh` writes both footers, so regenerating the seed keeps them.

A separate **gitignored** file `supabase/seed-memberships.sql` contains:

- UPDATE statements to restore stripped rider PII (email, ccn_id, birth_year, etc.)
- INSERT statements for `rider_memberships` (membership history with city/country)

To load the full dataset including PII and memberships:

```bash
npx supabase db reset
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed-memberships.sql
```

### Importing Membership CSVs

To import membership data from CCN CSV exports:

```bash
# Generic script (any season)
npx tsx scripts/import-memberships.ts <season> <csv-file-path> [--dry-run]

# 2025-specific script (has hardcoded season)
npx tsx scripts/import-memberships-2025.ts <csv-file-path> [--dry-run]
```

Always do a `--dry-run` first to review matches and new rider creation.

## Regenerating Seed Data

Use the generate-seed script to capture the current database state:

```bash
./scripts/generate-seed.sh
```

This script:

- Uses `pg_dump` from inside Docker (avoids version mismatch issues)
- Generates clean INSERT statements with column names
- Excludes `admins`, `images`, and `rider_memberships` tables
- Strips PII from rider rows (email, emergency contacts, ccn_id, birth_year → NULL)
- Generates `supabase/seed-memberships.sql` (gitignored) with rider PII updates and rider_memberships data

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

Migrations are applied to production automatically by `.github/workflows/deploy-migrations.yml` whenever a push to `main` changes `supabase/migrations/**`. Nothing else is needed after merging.

#### Setup

The workflow requires three repository settings:

```bash
gh secret set SUPABASE_ACCESS_TOKEN   # Dashboard → Account → Access Tokens
gh secret set SUPABASE_DB_PASSWORD    # the project's Postgres password
gh variable set SUPABASE_PROJECT_REF --body blddxbjpgqhyvergugzh
```

If any of these are missing, the job fails immediately with a message naming which one(s).

#### Why this workflow exists

Vercel deploys the same commit concurrently and does not wait for migrations. Before this workflow existed, a merge whose code read a new column would 500 with Postgres `42703` until someone ran `db push` by hand (Sentry JAVASCRIPT-NEXTJS-2Q / -2D, 2026-08-27; same pattern on 2026-07-03).

#### Backward compatibility

The job usually finishes well before the Vercel build does, but nothing enforces this, and the previous release keeps running for a minute or so after the migration lands. Migrations therefore must be backward-compatible with the previous release:

- Additive changes (new nullable columns, new tables) are safe.
- Renames and drops need a two-step rollout: add the new column/table in one PR (deploy the code that reads it), then drop the old one in a later PR.

#### Manual fallback

If needed, re-run via:

```bash
gh workflow run deploy-migrations.yml
```

Or push locally with the direct commands (note that the workflow links first because GitHub runners lack IPv6):

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### Cron triggers

Hourly jobs in Postgres call the site's `/api/cron/*` endpoints. They replaced GitHub Actions `schedule:` triggers as the scheduler, because GitHub runs those on a best-effort basis (see the header of `supabase/migrations/20261110120000_app_cron_triggers.sql`). The migration enables `pg_cron` and `pg_net`, and each job runs `public.trigger_app_cron(job)`, which makes an authenticated GET to `<site>/api/cron/<job>`.

| Job                        | Schedule (UTC) | Does                                                                       |
| -------------------------- | -------------- | -------------------------------------------------------------------------- |
| `app-cron-complete-events` | `0 * * * *`    | GET `/api/cron/complete-events`                                            |
| `app-cron-card-reminders`  | `15 * * * *`   | GET `/api/cron/card-reminders`                                             |
| `app-cron-announce-awards` | `30 * * * *`   | GET `/api/cron/announce-awards`                                            |
| `app-cron-prune-logs`      | `45 3 * * *`   | Deletes `cron.job_run_details` and `app_cron_runs` rows older than 30 days |

Each request is logged in `public.app_cron_runs (job, request_id, requested_at)`.

#### One-time production setup

The site URL and the cron secret come from Supabase Vault. Run this once in the Supabase SQL editor, with real values in place of the placeholders:

```sql
select vault.create_secret('https://<canonical-host>', 'app_cron_site_url');
select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'app_cron_secret');
```

- The URL must be the canonical host exactly, with no path. pg_net does not follow redirects, and the site's canonical host is the `www` one.
- The secret must match the `CRON_SECRET` environment variable in Vercel.
- To rotate the secret, call `vault.update_secret(<id>, '<new>')` with the id from `select id from vault.secrets where name = 'app_cron_secret'`, and change `CRON_SECRET` in Vercel to the same value.

The secrets can be set before or after the migration deploys. Until both exist, each job logs a warning and does nothing.

#### Checking that it works

```sql
-- Did the jobs fire, and what did the endpoint answer? (responses are kept ~6 hours)
select r.job, r.requested_at, h.status_code, h.timed_out, h.error_msg, left(h.content, 300) as body
from app_cron_runs r
left join net._http_response h on h.id = r.request_id
order by r.requested_at desc
limit 20;

-- pg_cron's own log
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 20;
```

Errors raised inside an endpoint still go to Sentry. A 401 in the first query means the Vault secret and the Vercel `CRON_SECRET` differ. No rows in `app_cron_runs` means the Vault secrets are missing or pg_cron is not running.

#### Local development and pausing

The jobs exist in local databases too, but no Vault secrets are set there, so they do nothing. To stop a job in production, run `select cron.unschedule('app-cron-card-reminders');`. Re-running the migration's `cron.schedule` call brings it back.

### Generate TypeScript types

```bash
npx supabase gen types typescript --local > types/database.ts
```
