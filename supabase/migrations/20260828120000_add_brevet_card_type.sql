-- Riders choose at registration whether they want a paper brevet card at the
-- start (the default) or will use the digital card instead. Organizers use
-- this to know how many paper cards to print. Existing rows default to paper.
ALTER TABLE registrations
  ADD COLUMN brevet_card_type TEXT NOT NULL DEFAULT 'paper'
  CONSTRAINT registrations_brevet_card_type_check
  CHECK (brevet_card_type IN ('paper', 'digital'));

COMMENT ON COLUMN registrations.brevet_card_type IS
  'Brevet card the rider asked for at registration: paper (printed at the start) or digital.';
