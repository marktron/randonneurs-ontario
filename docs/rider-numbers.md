# Rider Numbers

Each rider is assigned a permanent sequential number based on when they first participated in a qualifying event.

## Assignment Rules

- **Qualifying event**: Any result where `status != 'dns'`. This includes finished, DNF, OTL, and DQ results.
- **Ordering**: Riders are numbered sequentially by the date of their first qualifying event. Ties (same event date) are broken by `riders.created_at`.
- **No number**: Riders with zero qualifying results have `rider_number = NULL`.
- **Permanence**: Once assigned, a rider number never changes or gets recalculated, with one exception: it is revoked if the rider loses their last qualifying result (see Revocation).
- **No reuse**: A retired number (rider deleted or merged away) is never issued again. Gaps in the sequence are expected.

## How Numbers Are Assigned

### Existing riders (backfill)

The migration `20260211120000_add_rider_number.sql` backfills all existing riders using a CTE that finds each rider's earliest qualifying event date, then assigns sequential numbers via `ROW_NUMBER()`.

### New results (trigger)

A database trigger (`trg_assign_rider_number`) fires after every `INSERT` or `UPDATE OF status, rider_id` on the `results` table. If the result status is not `dns` and the rider doesn't already have a number, it assigns the next value of `rider_number_seq`. The sequence was seeded from the highest existing number by `20261028120000_rider_number_sequence.sql`; it replaced `MAX(rider_number) + 1`, which reissued the number of a deleted top rider and was racy under concurrent inserts.

This trigger covers all code paths that create results: single create, bulk import, and rider self-submission.

The trigger also fires on `UPDATE OF rider_id`, so moving a result to a rider without a number assigns that rider one.

### Revocation

`trg_revoke_rider_number` (function `revoke_rider_number()`) fires after `UPDATE OF status, rider_id` or `DELETE` on `results`. If the old rider has no remaining result with `status != 'dns'`, their `rider_number` is set to NULL. This covers a result corrected to DNS, deleted, or moved to another rider. A rider who qualifies again gets a fresh number from the sequence, which is higher than the one they lost; the old number is not restored.

### Recompute on 2026-10-29

Numbers had drifted from the ordering rule because of merges, late imports, and results later corrected to DNS or deleted. `20261029120000_recompute_rider_numbers.sql` recomputed every number once, by first qualifying event date, then `riders.created_at`, then the old number. The old-to-new mapping is in `docs/rider-number-recompute-2026-10-29.csv`. Numbers are frozen from that date.

Ordering drifts slightly over time, because results are entered in submission order, not event order. A late-entered result for an older event gets a higher number than riders who first rode after it. That is accepted.

### Merging riders

`mergeRiders` keeps the lowest non-null `rider_number` among all merged riders (target included) and writes it to the surviving rider after the others are deleted. If no merged rider has a number, the column is left alone. The higher numbers are retired, not reassigned.

## Database Schema

- **Column**: `riders.rider_number` (INTEGER, UNIQUE, nullable)
- **View**: `public_riders` includes `rider_number`
- **Triggers**: `trg_assign_rider_number` and `trg_revoke_rider_number` on `results` table
- **Sequence**: `rider_number_seq`
- **Functions**: `assign_rider_number()`, `revoke_rider_number()` (both SECURITY DEFINER)

## Display

Rider numbers are shown on the rider profile page (`/riders/[slug]`) between the rider's name and their stats summary, styled as uppercase metadata text (e.g., "RIDER #42").
