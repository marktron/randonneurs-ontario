# Database Schema Plan for Randonneurs Ontario

This document outlines the proposed Supabase (PostgreSQL) database schema for the Randonneurs Ontario application.

## Overview

The schema evolves from an existing SQLite model (used for historical results) into a production-ready PostgreSQL design with:

- **UUID primary keys** (Supabase standard)
- **Proper timestamps** (`TIMESTAMPTZ`)
- **Supabase Auth for admins** (riders don't have accounts)
- **Membership handled externally** (via CCN Bikes)

---

## Core Tables

### 1. chapters

Formalizes the 4 chapters as a proper entity:

```sql
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,        -- 'toronto', 'ottawa', 'simcoe', 'huron'
  name TEXT NOT NULL,               -- 'Toronto', 'Ottawa', etc.
  description TEXT,
  founded_year INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. routes

Canonical route definitions, linked to chapters:

```sql
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  chapter_id UUID REFERENCES chapters(id),
  distance_km INT,
  collection TEXT,                  -- e.g., '200km-brevets', 'devil-week', 'populaires'
  description TEXT,
  rwgps_id TEXT,                    -- RideWithGPS route ID (URL constructed as needed)
  cue_sheet_url TEXT,               -- PDF cue sheet
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. events

Unified events table supporting all event types (replaces `brevets`):

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  chapter_id UUID NOT NULL REFERENCES chapters(id),
  route_id UUID REFERENCES routes(id),

  -- Event details
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('brevet', 'populaire', 'fleche', 'permanent')),
  distance_km INT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME,
  start_location TEXT,

  -- Registration settings
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  external_register_url TEXT,       -- For CCN Bikes links

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),

  -- Metadata
  season INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM event_date)) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(chapter_id, slug, event_date)
);
```

### 4. riders

All riders (historical and current):

```sql
CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,                       -- Optional, for contact
  gender TEXT CHECK (gender IN ('M', 'F', 'X')),
  emergency_contact_name TEXT,      -- Emergency contact for rides
  emergency_contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. registrations

Event registrations:

```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id),

  registered_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,                       -- Notes for organizer

  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),

  UNIQUE(event_id, rider_id)
);
```

### 6. results

Event results:

```sql
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  rider_id UUID NOT NULL REFERENCES riders(id),

  finish_time INTERVAL,             -- e.g., '12:34:00' for 12h 34m
  status TEXT DEFAULT 'finished' CHECK (status IN ('finished', 'dnf', 'dns', 'otl', 'dq')),
  note TEXT,                        -- e.g., '(Unofficial result)'

  -- For team events (Fleche)
  team_name TEXT,

  -- Denormalized for query performance
  season INT NOT NULL,
  distance_km INT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, rider_id)
);
```

### 7. awards

Award definitions:

```sql
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  award_type TEXT,                  -- e.g., 'distance', 'season', 'special'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 8. result_awards

Junction table linking results to awards:

```sql
CREATE TABLE result_awards (
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id),
  PRIMARY KEY (result_id, award_id)
);
```

### 9. admins

Admin users (uses Supabase Auth):

```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'chapter_admin')),
  chapter_id UUID REFERENCES chapters(id),  -- NULL for org-wide admins
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- `admin`: Full access to all chapters
- `chapter_admin`: Scoped to manage events/results for their chapter only

---

## Recommended Indexes

```sql
-- Events
CREATE INDEX idx_events_chapter ON events(chapter_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_season ON events(season);
CREATE INDEX idx_events_type ON events(event_type);

-- Results
CREATE INDEX idx_results_event ON results(event_id);
CREATE INDEX idx_results_rider ON results(rider_id);
CREATE INDEX idx_results_season ON results(season);

-- Registrations
CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_rider ON registrations(rider_id);

-- Routes
CREATE INDEX idx_routes_chapter ON routes(chapter_id);
CREATE INDEX idx_routes_collection ON routes(collection);

-- Riders
CREATE INDEX idx_riders_slug ON riders(slug);
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Single `riders` table** | No user auth means we don't need separate members vs riders. All participants go in one table. |
| **`events` replaces `brevets`** | More generic name supports all event types (Brevets, Populaires, Fleches, Permanents) |
| **Permanents as events** | Permanent rides use `event_type='permanent'` rather than a separate table |
| **`season` computed column** | Automatic year extraction from event_date, saves manual data entry |
| **`INTERVAL` for finish_time** | Native PostgreSQL type for durations, enables queries like "all sub-12-hour finishes" |
| **Supabase Auth for admins** | Admins use Supabase Auth; riders do not have accounts |
| **No membership tracking** | Membership is managed externally via CCN Bikes |
| **In-app registration** | Registration happens at `/register`, creating entries in `registrations` table |
| **Route collections** | Simple `collection` column on routes (e.g., "200km-brevets", "devil-week") |
| **RWGPS ID only** | Store RideWithGPS route ID, construct full URL as needed |
| **No route versioning** | Significant route changes get a new route name instead |
| **Manual award assignment** | Awards assigned manually for now; automatic calculation is future work |
| **Soft status fields** | Events use `status` instead of deleting, preserving history |

---

## Entity Relationships

```
chapters
  ├── events (1:many)
  ├── routes (1:many)
  └── admins (1:many, for chapter_admins)

events
  ├── route (many:1, optional)
  ├── registrations (1:many)
  └── results (1:many)

riders
  ├── registrations (1:many)
  └── results (1:many)

results
  └── result_awards → awards (many:many)

admins (auth.users)
  └── chapter (many:1, optional for org-wide admins)
```

---

## Rider Deduplication Strategy

Since there are no user accounts and riders can register with any name variation (e.g., "Tom Jones" vs "Thomas Jones"), we need a strategy for matching registrations to existing rider records.

**Approach:**
1. **Email-based matching** (going forward): Use email as primary identifier for new registrations. Historical records don't have email, so this only helps with future data.
2. **Fuzzy name matching**: Suggest potential matches during registration/result entry based on name similarity.
3. **Admin merge UI**: Provide an admin interface to manually merge duplicate rider records when discovered.

---

## Data Migration

Historical results will be imported from an existing SQLite database. Future results will be entered manually.

---

## Next Steps

1. Create Supabase project and apply migrations
2. Build TypeScript types from schema (using Supabase CLI)
3. Import historical data from SQLite
4. Create seed data for chapters
5. Build registration form at `/register`
