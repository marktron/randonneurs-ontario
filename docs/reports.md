# Admin Reports

The Reports page (`/admin/reports`) provides chapter-wide season statistics for club administrators.

## Sections

### Summary Cards

Four top-level metrics: **Members** (with new/returning breakdown), **Retention** (% of prior year members who renewed), **Unique Riders** (with finish count and completion rate), and **Total Distance** (with event count and avg riders/event).

### Events by Distance

Events grouped into distance buckets (Populaire, 200, 300, 400, 600, 1000+) with event count and total unique finishers per bucket. Only includes completed/submitted events.

### Participation Breakdown

Result status counts: Finished, DNF, DNS, OTL.

### Top Riders

Top 10 riders by total distance for the season, with event count. Links to rider detail pages.

### Year over Year

5-season comparison table showing members, events, riders, and total distance per year. Current season row is bold.

### Rode Without Membership

Riders who have finished results this season but no membership record on file. Useful for outreach. Only shown when there are matches.

## Filters

- **Season:** Defaults to `NEXT_PUBLIC_CURRENT_SEASON`. Populated from `get_distinct_event_seasons` RPC.
- **Chapter:** Defaults to the admin's chapter (if chapter admin) or "All Chapters". Uses chapter ID from URL params.

Filter state is stored in URL params (`?season=2025&chapter=uuid`), matching the Events page pattern.

## Database

Six RPC functions in `supabase/migrations/20260318153019_add_report_rpc_functions.sql`:

| Function                                                 | Returns                                    |
| -------------------------------------------------------- | ------------------------------------------ |
| `get_report_membership_stats(p_season, p_chapter_id)`    | total/new/returning/prior_year members     |
| `get_report_event_stats(p_season, p_chapter_id)`         | events and riders by distance bucket       |
| `get_report_participation_stats(p_season, p_chapter_id)` | finish/DNF/DNS/OTL counts and total km     |
| `get_report_top_riders(p_season, p_chapter_id, p_limit)` | rider name, events finished, total km      |
| `get_report_yoy_summary(p_season, p_chapter_id)`         | 5-year summary of members/events/riders/km |
| `get_report_non_renewed_riders(p_season, p_chapter_id)`  | riders with results but no membership      |

All functions accept an optional `p_chapter_id` parameter. When NULL, they aggregate across all chapters.

## Adding New Report Sections

1. If the query is complex, add an RPC function in a new migration
2. Add a fetch function in `app/admin/reports/page.tsx`
3. Add it to the `Promise.all` in `AdminReportsPage`
4. Render the data in a new Card
