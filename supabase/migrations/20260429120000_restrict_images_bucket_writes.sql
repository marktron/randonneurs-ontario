-- Remove authenticated-user write access from the `images` storage bucket
-- and the `images` metadata table. All uploads are performed via the
-- service-role client in lib/actions/images.ts (createSignedUploadUrl plus
-- a service-role INSERT into the images table). The browser uses the
-- signed URL token for the actual PUT, not the user's auth role, so the
-- existing `auth.role() = 'authenticated'` policies are unused by the
-- legitimate flow but expose an abuse surface: anyone who can sign up via
-- Supabase Auth (GoTrue API with the public anon key) could otherwise
-- upload arbitrary files to a public-read CDN bucket.
--
-- Public read access is preserved (the bucket and metadata table are
-- intentionally publicly readable).
--
-- This mirrors the safer pattern already in place for the rider-submissions
-- bucket (see 20260324120000_restrict_rider_submissions_insert.sql).
-- See: docs/2026-04-29-audit.md finding #6.

DROP POLICY IF EXISTS "Authenticated users can upload images"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can update images"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete images"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can insert image metadata"
  ON images;

DROP POLICY IF EXISTS "Authenticated users can update image metadata"
  ON images;

DROP POLICY IF EXISTS "Authenticated users can delete image metadata"
  ON images;
