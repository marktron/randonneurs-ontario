-- Add share_registration column to registrations table
ALTER TABLE registrations ADD COLUMN share_registration BOOLEAN DEFAULT false;
