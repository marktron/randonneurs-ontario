-- Remove anonymous/public INSERT access on the rider-submissions storage bucket.
-- Uploads are performed via the service-role client in lib/actions/rider-results.ts,
-- so public INSERT is not required and exposes an abuse surface.
-- Public read access is preserved (the bucket is intentionally public-read).
-- See: https://github.com/marktron/randonneurs-ontario/issues/49

DROP POLICY IF EXISTS "Public upload access for rider submissions"
  ON storage.objects;
