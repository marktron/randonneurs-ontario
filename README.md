# Randonneurs Ontario Website

The official website for Randonneurs Ontario, providing event calendars, route information, registration, and results for Ontario's randonneuring community.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Email**: SendGrid
- **Maps**: RideWithGPS integration

## Prerequisites

- Node.js 20+
- npm
- Supabase CLI (`npx supabase`)
- Docker (for local Supabase)

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd randonneurs-ontario
npm install
```

### 2. Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.local.example .env.local
```

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side key (never expose to client)
- `SENDGRID_API_KEY` - For registration confirmation emails
- `NEXT_PUBLIC_CURRENT_SEASON` - Current riding season year

### 3. Database Setup

Start the local Supabase instance:

```bash
npx supabase start
```

This runs PostgreSQL, Auth, and other Supabase services in Docker. The CLI will output local credentials to use in `.env.development.local`.

Apply migrations and seed data:

```bash
npx supabase db reset
```

Stop Supabase when done:

```bash
npx supabase stop
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Project Structure

```
app/                    # Next.js App Router pages
├── admin/              # Admin dashboard (protected)
│   ├── events/         # Event management
│   ├── routes/         # Route management
│   ├── riders/         # Rider management
│   ├── results/        # Results management
│   └── users/          # Admin user management
├── calendar/[chapter]/ # Event calendars by chapter
├── results/            # Historical results
├── routes/[chapter]/   # Route listings by chapter
├── register/           # Event registration
├── riders/[slug]/      # Rider profiles
└── ...                 # Static content pages

components/             # React components
├── admin/              # Admin-specific components
├── ui/                 # shadcn/ui components
└── ...                 # Page-level components

lib/                    # Utilities and data access
├── actions/            # Server actions (forms, mutations)
├── data/               # Data fetching functions
├── email/              # Email templates and sending
└── ...                 # Supabase clients, utilities

supabase/
├── migrations/         # Database schema migrations
└── seed.sql            # Development seed data

types/                  # TypeScript type definitions
```

## Key Concepts

### Chapters

Randonneurs Ontario is organized into regional chapters:
- **Toronto** - GTA, Niagara, surrounding regions
- **Ottawa** - Eastern Ontario, Ottawa Valley
- **Simcoe-Muskoka** - Georgian Bay, Kawarthas, Muskoka
- **Huron** - Lake Huron, Southwestern Ontario

Each chapter organizes its own events and maintains routes.

### Events

Events have types:
- **Brevet** - Timed long-distance rides (200km+) with ACP homologation
- **Populaire** - Shorter introductory rides (typically 100-150km)
- **Fleche** - Team 24-hour rides
- **Permanent** - Self-supported rides available year-round

### Routes

Routes are stored with RideWithGPS integration for maps and cue sheets. Routes can belong to collections (e.g., "Granite Anvil" for 1000km+ routes).

### Results

Historical results are tracked per rider with finish times and statuses (finished, DNF, DNS, OTL, DQ). Results power rider profiles and statistics.

## Database

The database schema includes:
- `chapters` - Regional chapter information
- `routes` - Route definitions with RWGPS links
- `events` - Scheduled events linked to routes
- `riders` - Rider profiles
- `registrations` - Event registrations
- `results` - Completion records
- `awards` - Special achievements
- `admins` - Admin users with role-based access

See `supabase/migrations/` for the complete schema.

## Development

### Adding New Pages

1. Create a new directory under `app/`
2. Add `page.tsx` for the route
3. Use existing components from `components/` and `components/ui/`

### Database Changes

1. Create a new migration:
   ```bash
   npx supabase migration new description_of_change
   ```
2. Write SQL in the generated file under `supabase/migrations/`
3. Apply with `npx supabase db reset` (development) or push to production

### Adding UI Components

This project uses shadcn/ui. Add new components with:

```bash
npx shadcn@latest add <component-name>
```

## Useful Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # Run ESLint

npx supabase start           # Start local Supabase
npx supabase stop            # Stop local Supabase
npx supabase db reset        # Reset database with migrations + seed
npx supabase migration new   # Create new migration
```

## Learn More

- [Randonneurs Ontario](https://randonneursontario.ca) - Current website
- [Audax Club Parisien](https://www.audax-club-parisien.com/) - International randonneuring organization
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
