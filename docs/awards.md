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
| Ontario Rover        | season | 1200 km of Permanents with at least two 300+ km            | Lime          |
| Ontario Explorer     | season | Completed a brevet in every chapter during a calendar year | Emerald       |
| O-5000               | season | Completed 5000+ km of sanctioned events in a calendar year | Cyan          |
| O-12                 | season | Completed a 200+ km event for 12 consecutive months        | Violet        |
| Ontario Rouleur      | season | Completed 4 populaires, a brevet, and an Audax-style event | Sky           |
| Paris-Brest-Paris    | result | Completed Paris-Brest-Paris                                | Blue          |
| Granite Anvil        | result | Completed the Granite Anvil 1200 km brevet                 | Fuchsia       |
| Course Record\*      | —      | Fastest recorded time for a route                          | Gold gradient |

\*Course Record is a **calculated award** that is not stored in the database. It is computed dynamically on the route detail page (`/routes/[chapter]/[slug]`) by finding the fastest finish time among all results for that route. If multiple riders share the same fastest time, they all receive the Course Record badge.

## Awards Page (`/awards`)

Dedicated page displaying Ontario club awards and ACP distance awards. Each Ontario award section shows the award badge image, description, and a table of recipients. The O-5000 section includes a distance column showing the rider's total season distance.

### Ontario Awards

Displayed in order: O-12, Ontario Explorer, O-5000, Ontario Rouleur, Ontario Rover.

### ACP Awards

Randonneur 10000 and Randonneur 5000 — moved here from the `/records` page.

### Data Fetching

Award recipient data is fetched in `lib/data/awards.ts`:

- **`getOntarioAwards()`** — Fetches recipients for all five Ontario awards in parallel. Uses `get_award_recipients` for most awards, and `get_award_recipients_with_distance` for O-5000.
- **`getAcpAwards()`** — Fetches Randonneur 10000 and 5000 recipients.

Both use `unstable_cache` with 24-hour TTL and `awards` cache tags.

### Components

- **`AwardRecipientTable`** — Displays rider name and year. Title prop is optional.
- **`AwardRecipientDistanceTable`** — Like `AwardRecipientTable` but with a distance column showing `seasonDistance`. Used for O-5000.
- **`RecordSection`** — Shared with `/records`. Accepts an optional `image` prop for badge display alongside the section header.

### Database Function

**`get_award_recipients_with_distance(slug)`** — Returns recipients with their total season distance. Uses `results.distance_km` (not `events.distance_km`) for correct flèche handling. Like `get_award_recipients`, it handles both season-scoped and result-scoped awards via `UNION ALL`.

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
- **`get_award_recipients_with_distance(slug)`** — Same dual-source pattern as above, but also returns each recipient's total season distance via `results.distance_km`
- **`get_rider_award_counts(slug, limit)`** — Same dual-source pattern, counting award rows (a rider can earn the same season award multiple times in one season)
- **`get_rider_sr_streaks(season, limit)`** — Queries `rider_awards` directly for SR streak calculations

## Adding New Awards

To add a brand-new award type to the catalogue:

1. Insert the award into the `awards` table with the appropriate `award_type`:
   - `'result'` — earned for a specific event (linked via `result_awards`)
   - `'season'` — earned across a season (linked via `rider_awards`)
2. Add color classes to `colorClassesMap` in `components/award-badge.tsx`
3. Add a default description to `defaultDescriptions` in `components/award-badge.tsx`

To assign an existing award to a rider:

- Use the admin page at **`/admin/awards`** (full admins only). Pick the award; the form
  adapts to the award's scope:
  - **Result-scoped**: pick a rider, then a specific result. The result must already
    exist; if it doesn't, create it from the event admin page first.
  - **Season-scoped**: pick a rider, the season (year), and an optional note.
- The page is assign-only. Mistakes are corrected directly in the database.

## Automatically Assigned Awards

### First Brevet

First Brevet is assigned automatically by a database trigger. There is no admin
action required — it follows the rider's results.

**Rule.** A rider gets First Brevet on their **earliest finished `brevet` result**.
Populaires, flèches, and permanents never trigger the award.

**Mechanics.** `trg_results_first_brevet` (defined in
`supabase/migrations/20260526120000_auto_assign_first_brevet.sql`) fires on every
INSERT, DELETE, and status/event_id/rider_id UPDATE on `results`. It calls
`reconcile_first_brevet_for_rider(rider_id)`, which:

1. Finds the rider's earliest finished `brevet` result (ties broken by `results.id`).
2. Deletes any First Brevet rows on the wrong result for that rider.
3. Inserts a First Brevet row on the correct result.
4. If the rider has no qualifying result, removes any stale First Brevet rows.

A second trigger (`trg_result_awards_unique_first_brevet`, BEFORE INSERT on
`result_awards`) rejects manual duplicates — a rider can only ever hold one
First Brevet row.

**Out-of-order data.** If a rider's 2025 brevet is entered first and then their
2020 brevet is added later, the award automatically moves to the 2020 result.

**Status changes.** Flipping the awarded result from `finished` to `dnf` moves the
award to the next-earliest finished brevet, if any.

**Rider merges.** When two riders are merged via `mergeRiders`, the source
rider's results have their `rider_id` updated to the target. The trigger
reconciles both riders — the source ends up with no award, and the target keeps
exactly one award, on whichever finished brevet (across both riders' history)
is earliest.

**Manual overrides.** The admin assign form at `/admin/awards` still accepts First
Brevet, but the trigger will reconcile any out-of-spec assignments the next time
that rider's results change.

### Completed Devil Week

Completed Devil Week is assigned automatically by a database trigger for the
**current season only**. Closed seasons are frozen and hand-curated.

**Rule.** The four (or more) events of a season's Devil Week are tagged
`events.collection = 'devil-week'`. A rider earns the award for a season when
that season has **at least four** tagged events and the rider has a
`status='finished'` result **with a `finish_time`** for **every** one of them. A
finished result with no recorded time does not count.

**Mechanics.** `trg_results_devil_week` (in
`supabase/migrations/20260625150136_auto_assign_devil_week.sql`) fires on every
INSERT, DELETE, and status/finish_time/event_id/rider_id/season UPDATE on
`results`. It calls `reconcile_devil_week_for_rider_season(rider_id, season)`,
which no-ops unless `season` is the live calendar year, then either tags **each**
of the rider's results on that season's tagged events with a
`completed-devil-week` row (when the series is complete) or removes them (when it
is not). The award is result-scoped, so the series shows on all of its rides.

**Tagging new seasons.** Each season, set `events.collection = 'devil-week'` on
that year's Devil Week events; the trigger handles the rest as results arrive.

**Status changes / deletions.** Flipping a qualifying result to `dnf`, clearing
its `finish_time`, or deleting it re-runs the reconciler and removes the
now-unearned award from the whole series.

**Known limitation.** The trigger fires on `results` changes only; editing an
event's `collection` or date does not re-reconcile results pointing at it
(matches First Brevet).

### Super Randonneur

Super Randonneur (SR) is assigned automatically by a database trigger for the
**current season only**. Closed seasons (2025 and earlier, and any season once
the calendar year rolls over) are frozen and hand-curated.

**Rule.** A qualifying ride is a **finished `brevet`** result at exactly 200, 300,
400, or 600 km. SR needs the **full set** — one 200, one 300, one 400, and one 600
— in a single season. There is **no substitution**: a longer ride never stands in
for a shorter one, so `200, 300, 600, 600` does not qualify, and neither does
`200, 300, 400, 1000`. A 1000/1200/1300 km brevet contributes nothing to SR.
SR can be earned an unlimited number of times per season. With `nX` = count of
qualifying rides at exactly X km, the number of SRs is
`LEAST(n200, n300, n400, n600)`. Permanents, flèches, and populaires never count.

**Mechanics.** `trg_results_super_randonneur` (in
`supabase/migrations/20260820120000_auto_assign_super_randonneur.sql`) fires on every
INSERT, DELETE, and status/event_id/distance_km/rider_id/season UPDATE on
`results`. It calls `reconcile_super_randonneur_for_rider_season(rider_id, season)`,
which no-ops unless `season` is the live calendar year, then adds or removes
**auto-assigned** `rider_awards` rows (`auto_assigned = true`) so their count
equals the computed SR count.

**Manual rows and off-club rides.** Auto rows never touch manual rows
(`auto_assigned = false`). When a rider's qualifying ride was ridden at another
club, the site shows fewer than four qualifying rides, so the auto count is short
— an admin assigns the missing SR by hand. Auto and manual rows are additive.
**Operational rule:** in the current season, only manually add an SR for off-club
series _beyond_ what is auto-computed, to avoid double-counting.

**Status changes / deletions.** Flipping a qualifying result to `dnf` or deleting
it re-runs the reconciler and removes the now-unsupported auto SR.

**Deploying mid-season.** The trigger only fires when a result row changes, so
results submitted before it existed would otherwise sit unawarded. A one-time
companion migration
(`supabase/migrations/20260820120100_super_randonneur_current_season_backfill.sql`)
reconciles every rider holding a current-season brevet result at an SR distance,
which grants the award to those who already completed a series and is a no-op for
everyone else. It only ever reaches the live season — the reconciler it calls is
season-gated — so history is untouched.

**Known limitation.** The trigger fires on `results` changes only; editing an
event's `event_type` or `event_date` does not re-reconcile results pointing at it
(matches First Brevet).
