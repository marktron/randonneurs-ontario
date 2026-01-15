-- Add index on results.status for records queries
-- This column is filtered in every records query (WHERE status = 'finished')
CREATE INDEX IF NOT EXISTS idx_results_status ON results(status);
