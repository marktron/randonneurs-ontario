# Records Page

The Records page (`/records`) displays club achievements and rankings across various categories. It celebrates the accomplishments of individual riders and tracks club-wide milestones.

## Record Categories

### Lifetime Achievements

All-time rankings based on a rider's complete history with Randonneurs Ontario.

| Record                          | Description                                          |
| ------------------------------- | ---------------------------------------------------- |
| Most Completed Events           | Total count of successful finishes (all event types) |
| Highest Total Distance          | Cumulative kilometers from all completed events      |
| Most Active Seasons             | Number of distinct seasons with at least one finish  |
| Most Completed Devil Week       | Number of years completing Devil Week                |
| Most Super Randonneur Awards    | Number of Super Randonneur awards earned             |
| Most Permanents Completed       | Total permanent event completions                    |
| Longest Active Streak           | Most consecutive seasons with at least one finish    |
| Longest Super Randonneur Streak | Most consecutive seasons earning Super Randonneur    |

#### Streak Display Logic

Only streaks that could still be active are shown (ending in current or previous season):

- **Active streak**: Rider finished in the current season - shows streak length only
- **Potential streak**: Rider's last finish was the previous season - shows "through YYYY" to indicate the streak is alive but not yet extended

Streaks that ended more than one season ago are excluded since they can no longer be extended.

### Season Records

Best single-season performances.

| Record                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| Most Events in a Season | Highest event count in a single season       |
| Highest Season Distance | Most kilometers in a single season           |
| Current Season Leaders  | Top riders by distance in the current season |

### Club Achievements

Season-by-season club statistics.

| Record                      | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| Most Unique Riders          | Season with the most individual participants                |
| Most Events Organized       | Season with the most completed events (excludes permanents) |
| Highest Total Club Distance | Season with the highest cumulative distance                 |

### Popular Routes

Route popularity metrics (excludes permanent routes).

| Record               | Description                              |
| -------------------- | ---------------------------------------- |
| Most Frequently Used | Routes used in the most events           |
| Most Riders          | Routes with the most unique participants |

### Paris-Brest-Paris

Records from the world's oldest cycling event.

| Record           | Description                         |
| ---------------- | ----------------------------------- |
| Most Completions | Most PBP finishes by a single rider |
| Fastest Times    | Fastest PBP finish times            |

### Granite Anvil

Records from Ontario's premier 1200km grand randonnée.

| Record           | Description                        |
| ---------------- | ---------------------------------- |
| Most Completions | Most Granite Anvil finishes        |
| Fastest Times    | Fastest Granite Anvil finish times |

## Technical Details

### Caching Strategy

Records are cached at two different intervals:

- **Historical records** (24 hours): Lifetime achievements, past season records, club achievements, route popularity, PBP, and Granite Anvil records
- **Current season** (1 hour): Current season distance leaders

### Data Sources

- All completion counts use `status = 'finished'` filter
- PBP events identified by `events.name = 'Paris-Brest-Paris'`
- Granite Anvil events identified by `events.collection = 'granite-anvil'`
- Award counts use `result_awards` junction table with award slugs:
  - `completed-devil-week`
  - `super-randonneur`

### Files

- **Page**: `app/records/page.tsx`
- **Data module**: `lib/data/records.ts`
- **Types**: `types/records.ts`
- **Components**:
  - `components/record-section.tsx` - Section container with title
  - `components/record-table.tsx` - Record tables with mobile card fallback

### Event Types Included

All event types count toward completion records:

- `brevet`
- `populaire`
- `fleche`
- `permanent`

Route popularity excludes permanents to focus on organized group events.
