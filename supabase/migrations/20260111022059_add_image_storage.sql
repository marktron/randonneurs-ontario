-- Create the images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Note: RLS is already enabled on storage.objects by Supabase

-- Policy: Anyone can view images in the public bucket
CREATE POLICY "Public read access for images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- Policy: Authenticated users (admins) can upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images'
  AND auth.role() = 'authenticated'
);

-- Policy: Authenticated users (admins) can update their uploads
CREATE POLICY "Authenticated users can update images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'images'
  AND auth.role() = 'authenticated'
);

-- Policy: Authenticated users (admins) can delete images
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'images'
  AND auth.role() = 'authenticated'
);

-- Create images metadata table for tracking uploads
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  alt_text TEXT,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);

-- Enable RLS on images table
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Anyone can read image metadata (public images)
CREATE POLICY "Public read access for image metadata"
ON images FOR SELECT
USING (true);

-- Only authenticated users can insert image metadata
CREATE POLICY "Authenticated users can insert image metadata"
ON images FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Only authenticated users can update image metadata
CREATE POLICY "Authenticated users can update image metadata"
ON images FOR UPDATE
USING (auth.role() = 'authenticated');

-- Only authenticated users can delete image metadata
CREATE POLICY "Authenticated users can delete image metadata"
ON images FOR DELETE
USING (auth.role() = 'authenticated');

-- Add optional image_url column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON TABLE images IS 'Metadata for images uploaded to Supabase Storage';
COMMENT ON COLUMN images.storage_path IS 'Path to the image in the storage bucket (e.g., events/abc123.jpg)';
COMMENT ON COLUMN images.filename IS 'Original filename of the uploaded image';
COMMENT ON COLUMN images.alt_text IS 'Alt text for accessibility';
COMMENT ON COLUMN images.width IS 'Image width in pixels (if known)';
COMMENT ON COLUMN images.height IS 'Image height in pixels (if known)';
COMMENT ON COLUMN events.image_url IS 'URL to an image for this event (from Supabase Storage)';
