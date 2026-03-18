-- Fix: Column-level grants (from 20260318170000) break PostgREST aggregate
-- joins like `registrations(count)` used in getEventsByChapter.
--
-- Restore full SELECT on both tables. Token security relies on:
-- 1. Token entropy (UUID, 122 bits — not guessable)
-- 2. management_token nulled on cancellation
-- 3. All token-authenticated actions go through getSupabaseAdmin() (service role)
-- 4. Public-facing views (public_results, public_riders) exclude sensitive columns

GRANT SELECT ON registrations TO anon;
GRANT SELECT ON results TO anon;
