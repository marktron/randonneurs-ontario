-- Stamp-before-send claim for the digital brevet card reminder email sent
-- ~12 h before a rider's start (see docs/digital-brevet-card.md §11).
-- NULL = not yet sent. Claimed atomically with
-- UPDATE ... WHERE card_reminder_sent_at IS NULL so overlapping cron runs
-- can never double-email a rider.
ALTER TABLE registrations
  ADD COLUMN card_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN registrations.card_reminder_sent_at IS
  'When the digital brevet card reminder email was claimed for sending (NULL = not sent).';
