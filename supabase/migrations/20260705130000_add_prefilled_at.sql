-- Provenance marker for digital brevet card pre-fills
-- (see docs/digital-brevet-card.md). NULL = not a card pre-fill (admin-entered
-- or rider-submitted). The card sets it on pre-fill; revert requires and clears
-- it; an organizer or rider touching the row clears it, making the row
-- authoritative and immune to a later undo overwrite.
ALTER TABLE results ADD COLUMN prefilled_at TIMESTAMPTZ;

COMMENT ON COLUMN results.prefilled_at IS
  'When the digital-card final check-in pre-filled this result. Provenance marker: NULL means admin-entered or rider-submitted, and a rider undo must never overwrite it.';
