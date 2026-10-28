# Rider Numbers

Each rider is assigned a permanent sequential number based on when they first participated in a qualifying event.

## Assignment Rules

- **Qualifying event**: Any result where `status != 'dns'`. This includes finished, DNF, OTL, and DQ results.
- **Ordering**: Riders are numbered sequentially by the date of their first qualifying event. Ties (same event date) are broken by `riders.created_at`.
- **No number**: Riders with zero qualifying results have `rider_number = NULL`.
- **Permanence**: Once assigned, a rider number never changes or gets recalculated.
- **No reuse**: A retired number (rider deleted or merged away) is never issued again. Gaps in the sequence are expected.

## How Numbers Are Assigned

### Existing riders (backfill)

The migration `20260211120000_add_rider_number.sql` backfills all existing riders using a CTE that finds each rider's earliest qualifying event date, then assigns sequential numbers via `ROW_NUMBER()`.

### New results (trigger)

A database trigger (`trg_assign_rider_number`) fires after every `INSERT` or `UPDATE OF status` on the `results` table. If the result status is not `dns` and the rider doesn't already have a number, it assigns the next value of `rider_number_seq`. The sequence was seeded from the highest existing number by `20261028120000_rider_number_sequence.sql`; it replaced `MAX(rider_number) + 1`, which reissued the number of a deleted top rider and was racy under concurrent inserts.

This trigger covers all code paths that create results: single create, bulk import, and rider self-submission.

### Merging riders

`mergeRiders` keeps the lowest non-null `rider_number` among all merged riders (target included) and writes it to the surviving rider after the others are deleted. If no merged rider has a number, the column is left alone. The higher numbers are retired, not reassigned.

## Database Schema

- **Column**: `riders.rider_number` (INTEGER, UNIQUE, nullable)
- **View**: `public_riders` includes `rider_number`
- **Trigger**: `trg_assign_rider_number` on `results` table
- **Sequence**: `rider_number_seq`
- **Function**: `assign_rider_number()` (SECURITY DEFINER)

## Display

Rider numbers are shown on the rider profile page (`/riders/[slug]`) between the rider's name and their stats summary, styled as uppercase metadata text (e.g., "RIDER #42").
