-- Single-send guard for the digital brevet card finish email
-- (see docs/digital-brevet-card.md). NULL = not sent.
ALTER TABLE results ADD COLUMN finish_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN results.finish_email_sent_at IS
  'When the digital-card finish (congrats / add-your-track) email was sent. Single-send guard.';
