-- events.status is nullable but every write path sets it (column defaults to
-- 'scheduled'), and getEventBySlug filters with `.neq('status', 'draft')`
-- (PostgREST `<>`), which silently excludes NULL rows instead of including
-- them like the RLS policy's `IS DISTINCT FROM` does. Close the gap by making
-- the column NOT NULL so the two can never diverge on a NULL row.
--
-- Defensive backfill first so this can't fail on prod if a NULL ever slipped
-- in; local DB currently has zero NULLs.
UPDATE events SET status = 'scheduled' WHERE status IS NULL;

ALTER TABLE events ALTER COLUMN status SET NOT NULL;
