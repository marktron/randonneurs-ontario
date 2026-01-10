# Getting Started Guide

This guide will walk you through setting up your development environment for the Randonneurs Ontario website.

## Prerequisites

Before you begin, make sure you have the following installed:

| Requirement | Version | How to Check | Install Link |
|-------------|---------|--------------|--------------|
| Node.js | 20+ | `node --version` | [nodejs.org](https://nodejs.org) |
| npm | 10+ | `npm --version` | Comes with Node.js |
| Docker | Latest | `docker --version` | [docker.com](https://www.docker.com/get-started) |
| Git | Latest | `git --version` | [git-scm.com](https://git-scm.com) |

Docker is required because the local Supabase instance runs in containers.

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd randonneurs-ontario
```

## Step 2: Install Dependencies

```bash
npm install
```

This installs all the project dependencies defined in `package.json`.

## Step 3: Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

For local development, the environment variables will be populated after starting Supabase (Step 4).

### Required Environment Variables

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | `npx supabase status` after starting |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous key | `npx supabase status` after starting |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key | `npx supabase status` after starting |
| `SENDGRID_API_KEY` | SendGrid API key (optional for dev) | [SendGrid Dashboard](https://sendgrid.com) |
| `NEXT_PUBLIC_CURRENT_SEASON` | Current riding season year | Set to current year (e.g., `2025`) |

## Step 4: Start Local Supabase

Start the local Supabase instance (this runs PostgreSQL and other services in Docker):

```bash
npx supabase start
```

**First time?** This will download Docker images and may take a few minutes.

After starting, you'll see output like this:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGc...
service_role key: eyJhbGc...
```

**Copy the values** to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...(anon key from above)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...(service_role key from above)
NEXT_PUBLIC_CURRENT_SEASON=2025
```

## Step 5: Initialize the Database

Apply all migrations and load seed data:

```bash
npx supabase db reset
```

This will:
1. Apply all SQL migrations from `supabase/migrations/`
2. Load seed data from `supabase/seed.sql`

After this, your database will have:
- 7 chapters (Toronto, Ottawa, Simcoe-Muskoka, Huron, Niagara, Other, Permanent)
- 302 routes
- 1,605 events (historical from 1983-2026)
- 1,130 riders
- 9,766 results

## Step 6: Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

You should see the Randonneurs Ontario homepage!

## Step 7: Create an Admin User (Optional)

To access the admin dashboard at `/admin`, you need an admin user:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=password123 \
ADMIN_NAME="Test Admin" \
npx tsx scripts/create-admin.ts
```

Now you can log in at `/admin/login` with those credentials.

## Useful URLs During Development

| URL | Description |
|-----|-------------|
| [localhost:3000](http://localhost:3000) | Main website |
| [localhost:3000/admin](http://localhost:3000/admin) | Admin dashboard |
| [localhost:54323](http://127.0.0.1:54323) | Supabase Studio (database admin) |
| [localhost:54324](http://127.0.0.1:54324) | Inbucket (local email testing) |

## Common Commands Reference

### Development

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
```

### Database

```bash
npx supabase start   # Start local Supabase
npx supabase stop    # Stop local Supabase
npx supabase db reset     # Reset database (re-apply migrations + seed)
npx supabase migration new <name>   # Create new migration
npx supabase status  # Show local URLs and keys
```

### UI Components

```bash
npx shadcn@latest add <component>   # Add new shadcn/ui component
```

## Project Structure Quick Reference

Here's where to find things:

| I want to... | Look in... |
|--------------|------------|
| Add a new page | `app/` directory |
| Create a new component | `components/` |
| Add a database query | `lib/data/` |
| Add a form submission handler | `lib/actions/` |
| Modify database schema | `supabase/migrations/` |
| Add an email template | `lib/email/templates.ts` |
| Update chapter info | `lib/chapter-config.ts` |
| Add a UI primitive | `components/ui/` (use shadcn) |

## Troubleshooting

### "Docker is not running"

Start Docker Desktop before running `npx supabase start`.

### "Port 54321 already in use"

Another Supabase instance may be running. Stop it:

```bash
npx supabase stop
npx supabase start
```

### "Missing environment variables"

Make sure:
1. `.env.local` exists
2. You copied values from `npx supabase status`
3. You restarted the dev server after changing `.env.local`

### Database is empty

Run `npx supabase db reset` to apply migrations and seed data.

### Can't log in to admin

1. Make sure you created an admin user (Step 7)
2. Check Supabase Studio (localhost:54323) to verify the user exists in `auth.users`

### Type errors in Supabase queries

Regenerate types after schema changes:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

## Next Steps

Once you're set up:

1. Read the [Architecture Overview](./ARCHITECTURE.md) to understand the codebase
2. Read the [Data Layer Guide](./DATA_LAYER.md) to understand data fetching
3. Check the [Style Guide](./style_guide.md) for UI conventions
4. Browse the codebase - start with `app/page.tsx` (homepage)

## Getting Help

- Check existing documentation in the `docs/` folder
- Look at similar code patterns in the codebase
- Ask in the team chat

Welcome to the team!
