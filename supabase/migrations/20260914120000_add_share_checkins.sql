-- Riders can see, on their own digital brevet card, which other riders have
-- checked in at each control. Each rider controls whether their own
-- check-ins are part of that view (docs/digital-brevet-card.md §7b).
-- Organizers always see every check-in in the admin grid regardless.
--
-- Everyone starts on, including existing rows and riders who chose not to
-- appear on the public registered-riders list: that list is world-visible,
-- while this view is only reachable by riders on the same event through
-- their own card link. Riders can turn it off from the card.
ALTER TABLE registrations
  ADD COLUMN share_checkins BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN registrations.share_checkins IS
  'Whether other riders on the event may see this registration''s digital-card check-ins. Organizers always can.';
