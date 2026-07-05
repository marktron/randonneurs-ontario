-- Single-send guard for the event-close "submit your results" email
-- (see docs/digital-brevet-card.md). NULL = not sent. Distinct from
-- finish_email_sent_at (the digital-card finish email): this column only
-- guards createPendingResultsAndSendEmails, so it can run repeatedly (cron
-- retry, admin re-completing an event) without double-emailing a rider.
-- The reminder flow (send-result-reminders.ts) intentionally ignores this
-- column — reminders are a separate, deliberately repeatable nudge.
ALTER TABLE results ADD COLUMN submission_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN results.submission_email_sent_at IS
  'When the event-close "submit your results" email was sent. Single-send guard for createPendingResultsAndSendEmails; the reminder flow deliberately ignores it.';
