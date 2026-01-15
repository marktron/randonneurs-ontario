# Awards System

Awards are displayed on rider profile pages (`/riders/[slug]`) to recognize various achievements in randonneuring.

## Overview

Awards are associated with individual results through the `result_awards` junction table. When a rider earns an award for completing a specific event (e.g., their first brevet or completing a Super Randonneur series), that award is linked to the relevant result record.

## Database Schema

### `awards` Table

- `id` - UUID primary key
- `slug` - Unique text identifier
- `title` - Display name of the award
- `description` - Optional description of the award criteria
- `award_type` - Optional categorization

### `result_awards` Junction Table

- `result_id` - References the result that earned the award
- `award_id` - References the award

## Available Awards

| Award                | Description                                                | Badge Color   |
| -------------------- | ---------------------------------------------------------- | ------------- |
| First Brevet         | Rode their first brevet with Randonneurs Ontario           | Zinc          |
| Super Randonneur     | Completed 200, 300, 400, and 600 km brevets in one season  | Amber         |
| Completed Devil Week | Completed 200, 300, 400, and 600 km during Devil Week      | Red           |
| Ontario Rover        | 1200 km of Permanents with at least two 300+ km            | Lime          |
| Ontario Explorer     | Completed a brevet in every chapter during a calendar year | Emerald       |
| O-5000               | Completed 5000+ km of sanctioned events in a calendar year | Cyan          |
| O-12                 | Completed a 200+ km event for 12 consecutive months        | Violet        |
| Paris-Brest-Paris    | Completed Paris-Brest-Paris                                | Blue          |
| Granite Anvil        | Completed the Granite Anvil 1200 km brevet                 | Fuchsia       |
| Course Record\*      | Fastest recorded time for a route                          | Gold gradient |

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

// Aggregate all awards from results
const allAwards = results.flatMap(r => r.awards)
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

Awards are fetched alongside results in the `getRiderResults` function via a join through the `result_awards` table:

```typescript
// Example query structure (from lib/data/results.ts)
.select(`
  ...,
  result_awards (
    awards (
      title,
      description
    )
  )
`)
```

## Adding New Awards

1. Insert the award into the `awards` table
2. Add color classes to `colorClassesMap` in `components/award-badge.tsx`
3. Add a default description to `defaultDescriptions` in `components/award-badge.tsx`
4. Link results to awards via the `result_awards` table
