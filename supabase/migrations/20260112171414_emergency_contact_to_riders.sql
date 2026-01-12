-- Move emergency contact from registrations to riders table
-- Emergency contact is rider-level data that persists across events

-- Add columns to riders table
ALTER TABLE riders
  ADD COLUMN emergency_contact_name TEXT,
  ADD COLUMN emergency_contact_phone TEXT;

-- Remove from registrations table
ALTER TABLE registrations DROP COLUMN emergency_contact;
