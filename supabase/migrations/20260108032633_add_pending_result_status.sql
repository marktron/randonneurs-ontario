-- Add 'pending' to the allowed result statuses
-- This allows admins to add riders to events before assigning a final result

ALTER TABLE results DROP CONSTRAINT IF EXISTS results_status_check;

ALTER TABLE results ADD CONSTRAINT results_status_check
  CHECK (status IN ('pending', 'finished', 'dnf', 'dns', 'otl', 'dq'));
