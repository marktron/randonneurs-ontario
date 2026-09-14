-- Riders can see, on their own digital brevet card, which other riders have
-- checked in at each control. Each rider controls whether their own
-- check-ins are part of that view (docs/digital-brevet-card.md §7b).
-- Organizers always see every check-in in the admin grid regardless.
ALTER TABLE registrations
  ADD COLUMN share_checkins BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN registrations.share_checkins IS
  'Whether other riders on the event may see this registration''s digital-card check-ins. Organizers always can.';

-- A rider who asked not to appear on the public registered-riders list
-- (share_registration false or unset) almost certainly does not want other
-- riders watching their check-ins either, so seed their preference off.
-- They can turn it on from their digital card.
UPDATE registrations
SET share_checkins = false
WHERE share_registration IS NOT TRUE;
