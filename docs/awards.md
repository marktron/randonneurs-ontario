# Awards System

Awards are displayed on rider profile pages (`/riders/[slug]`) to recognize various achievements in randonneuring.

## Overview

Awards have two scopes, determined by the `awards.award_type` column:

- **Result-scoped** (`award_type = 'result'`): Earned for a specific event result. Stored in the `result_awards` junction table. Examples: First Brevet, Completed Devil Week.
- **Season-scoped** (`award_type = 'season'`): Earned across a full season (not tied to any single result). Stored in the `rider_awards` table. Example: Super Randonneur.

## Database Schema

### `awards` Table

- `id` - UUID primary key
- `slug` - Unique text identifier
- `title` - Display name of the award
- `description` - Optional description of the award criteria
- `award_type` - Scope discriminator: `'result'` (default) or `'season'`

### `result_awards` Junction Table

For result-scoped awards:

- `result_id` - References the result that earned the award
- `award_id` - References the award

### `rider_awards` Table

For season-scoped awards:

- `id` - UUID primary key
- `rider_id` - References the rider (CASCADE delete)
- `award_id` - References the award
- `season` - The season (year) the award was earned
- `note` - Optional context (e.g., "Earned at RM 600 in Quebec")
- `created_at`, `updated_at` - Timestamps with auto-update trigger

No unique constraint on rider+award+season — a rider can earn the same season award multiple times in one season.

RLS: public SELECT, admin-only INSERT/UPDATE/DELETE (not chapter_admin, since season awards may span chapters).

## Available Awards

| Award                | Scope  | Description                                                | Badge Color   |
| -------------------- | ------ | ---------------------------------------------------------- | ------------- |
| First Brevet         | result | Rode their first brevet with Randonneurs Ontario           | Zinc          |
| Super Randonneur     | season | Completed 200, 300, 400, and 600 km brevets in one season  | Amber         |
| Completed Devil Week | result | Completed 200, 300, 400, and 600 km during Devil Week      | Red           |
| Ontario Rover        | result | 1200 km of Permanents with at least two 300+ km            | Lime          |
| Ontario Explorer     | result | Completed a brevet in every chapter during a calendar year | Emerald       |
| O-5000               | result | Completed 5000+ km of sanctioned events in a calendar year | Cyan          |
| O-12                 | result | Completed a 200+ km event for 12 consecutive months        | Violet        |
| Paris-Brest-Paris    | result | Completed Paris-Brest-Paris                                | Blue          |
| Granite Anvil        | result | Completed the Granite Anvil 1200 km brevet                 | Fuchsia       |
| Course Record\*      | —      | Fastest recorded time for a route                          | Gold gradient |

\*Course Record is a **calculated award** that is not stored in the database. It is computed dynamically on the route detail page (`/routes/[chapter]/[slug]`) by finding the fastest finish time among all results for that route. If multiple riders share the same fastest time, they all receive the Course Record badge.

## Components

### `AwardBadge`

Displays a single award badge with tooltip showing the award description.

```tsx
import { AwardBadge } from '@/components/award-badge'
;<AwardBadge award={{ title: 'Super Randonneur', description: null }} />
```

### `AwardBadgeList`

Displays multiple award badges in a flex-wrap layout.

```tsx
import { AwardBadgeList } from '@/components/award-badge'
;<AwardBadgeList
  awards={[
    { title: 'Super Randonneur', description: null },
    { title: 'First Brevet', description: null },
  ]}
/>
```

### `AwardSummary`

Displays aggregated awards with counts (for header summaries).

```tsx
import { AwardSummary, aggregateAwards } from '@/components/award-badge'

// Aggregate all awards from results AND season awards
const allAwards = [
  ...yearResults.flatMap(yr => yr.results.flatMap(r => r.awards ?? [])),
  ...yearResults.flatMap(yr => yr.seasonAwards ?? []),
]
const aggregatedAwards = aggregateAwards(allAwards)

<AwardSummary awards={aggregatedAwards} />
// Renders: "Super Randonneur × 3" "First Brevet" "O-5000 × 2"
```

The count ("× N") only displays when an award has been earned more than once.

## Styling

Award badges follow the club's design system:

- Small rounded pill badges
- Color-coded by award type (see table above)
- Dark mode support with inverted colors
- Tooltips display award descriptions on hover

## Data Fetching

Awards are fetched from two sources in `getRiderResults` (`lib/data/results.ts`):

1. **Result-scoped awards** — joined through `result_awards` in the main results query:

```typescript
.select(`
  ...,
  result_awards (
    awards (
      id, title, description
    )
  )
`)
```

2. **Season-scoped awards** — queried separately from `rider_awards`:

```typescript
const { data: seasonAwards } = await supabase
  .from('rider_awards')
  .select('season, awards(id, title, description)')
  .eq('rider_id', rider.id)
```

Season awards are grouped by year and attached to the corresponding `RiderYearResults.seasonAwards` array. They display in the year section header on the rider profile page, not attached to any specific result row.

### Database Functions

The `/records` page functions handle both award scopes:

- **`get_award_recipients(slug)`** — UNION query across `rider_awards` (season) and `result_awards` (result), branching on `awards.award_type`
- **`get_rider_award_counts(slug, limit)`** — Same dual-source pattern, counting distinct seasons
- **`get_rider_sr_streaks(season, limit)`** — Queries `rider_awards` directly for SR streak calculations

## Adding New Awards

1. Insert the award into the `awards` table with the appropriate `award_type`:
   - `'result'` — if earned for a specific event (link via `result_awards`)
   - `'season'` — if earned across a season (link via `rider_awards`)
2. Add color classes to `colorClassesMap` in `components/award-badge.tsx`
3. Add a default description to `defaultDescriptions` in `components/award-badge.tsx`
4. For result-scoped awards: link results to awards via the `result_awards` table
5. For season-scoped awards: insert into `rider_awards` with rider_id, award_id, and season
