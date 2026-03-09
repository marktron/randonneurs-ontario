-- Add management_token to registrations for self-service management URLs
-- and cancelled_at timestamp for tracking cancellation time

ALTER TABLE registrations ADD COLUMN management_token UUID DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE registrations ADD COLUMN cancelled_at TIMESTAMPTZ;

-- Partial index for fast token lookups (only non-null tokens)
CREATE INDEX idx_registrations_management_token ON registrations(management_token) WHERE management_token IS NOT NULL;

-- Backfill existing registrations with tokens
UPDATE registrations SET management_token = gen_random_uuid() WHERE management_token IS NULL;
