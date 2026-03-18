-- Add ON DELETE CASCADE to results.event_id foreign key.
-- This makes event deletion atomic: deleting an event automatically
-- removes all its results, matching the existing behavior of
-- registrations.event_id which already has ON DELETE CASCADE.

ALTER TABLE results
  DROP CONSTRAINT results_event_id_fkey,
  ADD CONSTRAINT results_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
