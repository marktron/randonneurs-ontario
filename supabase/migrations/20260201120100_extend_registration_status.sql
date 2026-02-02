-- Extend registrations.status to include 'incomplete: membership'
ALTER TABLE registrations
  DROP CONSTRAINT registrations_status_check;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_status_check
  CHECK (status IN ('registered', 'cancelled', 'incomplete: membership'));
