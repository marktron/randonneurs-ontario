# Randonneurs Ontario Website

The official website for [Randonneurs Ontario](https://randonneursontario.ca), a volunteer-run organization dedicated to **randonneuring** - non-competitive, long-distance cycling in Ontario, Canada.

This site serves as the central hub for:
- **Event calendars** for 4 regional chapters (Toronto, Ottawa, Simcoe-Muskoka, Huron)
- **Route information** with RideWithGPS integration
- **Event registration** for scheduled and permanent rides
- **Historical results** tracking and rider profiles
- **Admin dashboard** for event organizers

## Documentation

New to the project? Start here:

| Document | Description |
|----------|-------------|
| **[Getting Started](docs/GETTING_STARTED.md)** | Step-by-step setup guide for new developers |
| **[Architecture](docs/ARCHITECTURE.md)** | High-level system overview and key concepts |
| **[Data Layer](docs/DATA_LAYER.md)** | How data flows through the application |
| **[Contributing](docs/CONTRIBUTING.md)** | Coding standards and contribution guidelines |
| [Database Schema](docs/database-schema-plan.md) | Database design and ERD |
| [Database Setup](docs/database-setup.md) | Local database setup details |
| [Style Guide](docs/style_guide.md) | UI/UX design guidelines |

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

## Quick Start

> **Detailed instructions:** See [Getting Started Guide](docs/GETTING_STARTED.md) for step-by-step setup.

```bash
# 1. Clone and install
git clone <repository-url>
cd randonneurs-ontario
npm install

# 2. Set up environment
cp .env.local.example .env.local

# 3. Start local database
npx supabase start
npx supabase db reset

# 4. Copy credentials from supabase output to .env.local

# 5. Start development server
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

### Project Documentation
- [Architecture Overview](docs/ARCHITECTURE.md) - System design and key concepts
- [Data Layer Guide](docs/DATA_LAYER.md) - Database patterns and queries
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute

### External Resources
- [Next.js Documentation](https://nextjs.org/docs) - Framework reference
- [Supabase Documentation](https://supabase.com/docs) - Database and auth
- [shadcn/ui Documentation](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/docs) - Styling reference

### About Randonneuring
- [Randonneurs Ontario](https://randonneursontario.ca) - Club website
- [Audax Club Parisien](https://www.audax-club-parisien.com/) - International organization
- [Randonneurs USA](https://rusa.org/) - US randonneuring
