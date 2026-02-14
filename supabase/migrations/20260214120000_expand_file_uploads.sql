-- Expand the images bucket to accept document types (PDF, Word, Excel)
-- and increase the file size limit to 10MB
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  file_size_limit = 10485760 -- 10MB in bytes
WHERE id = 'images';
