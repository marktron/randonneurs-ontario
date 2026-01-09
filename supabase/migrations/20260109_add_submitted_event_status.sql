-- Add 'submitted' to allowed event statuses
-- This status indicates results have been sent to VP for recording

-- Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;

-- Add the new constraint with 'submitted' included
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'completed', 'submitted'));
