-- Drop unused register_for_event function
-- Registration is now handled by server action using service role client
DROP FUNCTION IF EXISTS register_for_event(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
