-- Pre-rides: an admin-approved rider may ride the course ahead of the
-- scheduled event with their own start date/time. The override lives on the
-- registration; all digital-card time math prefers it over the event start
-- (see docs/digital-brevet-card.md, "Pre-rides"). Setting these columns IS
-- the approval — there is no separate request/approve status.

ALTER TABLE registrations ADD COLUMN pre_ride_date DATE;
ALTER TABLE registrations ADD COLUMN pre_ride_start_time TIME;

-- Both set or both null: a date without a time would silently fall back to
-- midnight in the card time math.
ALTER TABLE registrations ADD CONSTRAINT registrations_pre_ride_both_or_neither
  CHECK ((pre_ride_date IS NULL) = (pre_ride_start_time IS NULL));
