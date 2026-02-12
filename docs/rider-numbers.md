# Rider Numbers

Each rider is assigned a permanent sequential number based on when they first participated in a qualifying event.

## Assignment Rules

- **Qualifying event**: Any result where `status != 'dns'`. This includes finished, DNF, OTL, and DQ results.
- **Ordering**: Riders are numbered sequentially by the date of their first qualifying event. Ties (same event date) are broken by `riders.created_at`.
- **No number**: Riders with zero qualifying results have `rider_number = NULL`.
- **Permanence**: Once assigned, a rider number never changes or gets recalculated.

## How Numbers Are Assigned

### Existing riders (backfill)

The migration `20260211120000_add_rider_number.sql` backfills all existing riders using a CTE that finds each rider's earliest qualifying event date, then assigns sequential numbers via `ROW_NUMBER()`.

### New results (trigger)

A database trigger (`trg_assign_rider_number`) fires after every `INSERT` or `UPDATE OF status` on the `results` table. If the result status is not `dns` and the rider doesn't already have a number, it assigns `MAX(rider_number) + 1`.

This trigger covers all code paths that create results: single create, bulk import, and rider self-submission.

## Database Schema

- **Column**: `riders.rider_number` (INTEGER, UNIQUE, nullable)
- **View**: `public_riders` includes `rider_number`
- **Trigger**: `trg_assign_rider_number` on `results` table
- **Function**: `assign_rider_number()` (SECURITY DEFINER)

## Display

Rider numbers are shown on the rider profile page (`/riders/[slug]`) between the rider's name and their stats summary, styled as uppercase metadata text (e.g., "RIDER #42").
