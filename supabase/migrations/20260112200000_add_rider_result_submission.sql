-- Add columns to results table for rider self-service result submission

-- Unique token for rider submission link (no auth required)
ALTER TABLE results ADD COLUMN submission_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- GPX evidence - either a URL (Strava, etc.) or an uploaded file
ALTER TABLE results ADD COLUMN gpx_url TEXT;
ALTER TABLE results ADD COLUMN gpx_file_path TEXT;

-- Control card photos (front and back)
ALTER TABLE results ADD COLUMN control_card_front_path TEXT;
ALTER TABLE results ADD COLUMN control_card_back_path TEXT;

-- Notes from rider to organizer
ALTER TABLE results ADD COLUMN rider_notes TEXT;

-- Track when rider submitted their result
ALTER TABLE results ADD COLUMN submitted_at TIMESTAMPTZ;

-- Index on submission_token for fast lookups
CREATE INDEX idx_results_submission_token ON results(submission_token) WHERE submission_token IS NOT NULL;

-- Create storage bucket for rider submissions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rider-submissions',
  'rider-submissions',
  true,
  10485760, -- 10MB for GPX files and photos
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/gpx+xml', 'application/xml', 'text/xml']
) ON CONFLICT (id) DO NOTHING;

-- RLS policies for rider-submissions bucket
-- Anyone can read (public bucket)
CREATE POLICY "Public read access for rider submissions"
ON storage.objects FOR SELECT
USING (bucket_id = 'rider-submissions');

-- Anyone can upload to rider-submissions (token-based auth handled in app)
CREATE POLICY "Public upload access for rider submissions"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rider-submissions');

-- Only authenticated users can update/delete
CREATE POLICY "Authenticated update for rider submissions"
ON storage.objects FOR UPDATE
USING (bucket_id = 'rider-submissions' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete for rider submissions"
ON storage.objects FOR DELETE
USING (bucket_id = 'rider-submissions' AND auth.role() = 'authenticated');
