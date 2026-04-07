-- Raise the rider-submissions storage bucket file_size_limit from 10 MB to
-- 100 MB to accommodate large GPX files. A 600 km brevet recorded at 1 Hz can
-- easily exceed 30 MB, and 1000 km+ randonnées can be much larger. Images are
-- still capped at 10 MB at the application layer (lib/actions/rider-results.ts)
-- because they're browser-compressed before upload, so the bucket-level cap
-- only matters for GPX uploads.

UPDATE storage.buckets
   SET file_size_limit = 104857600 -- 100 MiB
 WHERE id = 'rider-submissions';
