-- Add is_active field to routes table
ALTER TABLE routes
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Add index for filtering by active status
CREATE INDEX idx_routes_is_active ON routes(is_active);
