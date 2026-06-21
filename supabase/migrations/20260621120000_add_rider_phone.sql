-- Add the rider's own cell phone number to the riders table.
-- Collected during registration so organizers can reach riders during an event.
-- Stored at the rider level (like emergency contact) so it persists across events.

ALTER TABLE riders
  ADD COLUMN phone TEXT;
