# File Uploads

The admin interface supports uploading files (images and documents) to Supabase Storage via the `images` bucket.

## Supported File Types

| Category  | Types                                   | Max Size |
| --------- | --------------------------------------- | -------- |
| Images    | JPEG, PNG, WebP, GIF, HEIC/HEIF         | 10MB     |
| Documents | PDF                                     | 10MB     |
| Office    | Word (.doc, .docx), Excel (.xls, .xlsx) | 10MB     |

## How It Works

### Signed-URL Upload Flow

`lib/actions/images.ts` exposes a two-step signed-URL flow that bypasses Vercel's 4.5 MB Server Action body limit so the full 10 MB ceiling stays usable end-to-end:

1. **`createImageUploadUrl({ filename, contentType, sizeBytes, folder })`** — admin-only. Validates the input, generates a unique storage path under one of the allowed folders (`general`, `events`, `pages`, `headers`), and mints a one-time signed upload URL via `supabase.storage.from('images').createSignedUploadUrl(path)`. Returns `{ signedUrl, uploadToken, storagePath, publicUrl }`.
2. **Browser uploads directly** to Supabase Storage using `supabase.storage.from('images').uploadToSignedUrl(storagePath, uploadToken, file)`.
3. **`confirmImageUpload({ storagePath, filename, contentType, sizeBytes, altText })`** — admin-only. Re-validates the storage path against the allowed folder list, inserts the metadata row in the `images` table, and returns the full `UploadedFile` record. If the database insert fails the uploaded object is removed to avoid orphaning storage.

### Browser-Side Compression

Before any image is uploaded, the browser runs `lib/image-compression.ts → compressImageForUpload()` on it:

- Non-image files (PDF, DOCX, GPX, GIF) pass through unchanged.
- HEIC/HEIF (iPhone photos) are converted to JPEG via a lazy-imported `heic2any`.
- JPEG/PNG/WebP files larger than 500 KB are resized to fit within 2400 px on the longest edge and re-encoded as JPEG with quality 0.85, targeting ~2 MB.
- Files larger than 25 MB are rejected up front to avoid browser OOM.

This means the 10 MB server-side ceiling on `lib/actions/images.ts` and `lib/actions/rider-results.ts` is effectively a backstop — typical phone photos arrive at ~1–2 MB.

### Markdown Editor (Page Content)

The `MarkdownEditor` component (`components/admin/markdown-editor.tsx`) supports:

- **Drag and drop** any supported file onto the editor
- **Paste** images from clipboard
- Files are uploaded to the `pages/` folder in storage

Uploaded files are inserted as markdown:

- **Images** → `![filename](url)` (rendered inline)
- **Documents** → `[filename](url)` (rendered as download link)

A placeholder is shown during upload, and replaced with the final markdown on success or removed on failure.

### Image Upload Component

The `ImageUpload` component (`components/admin/image-upload.tsx`) provides a standalone drag-and-drop zone for uploading hero images on events and pages. This only accepts image files. The `HeaderImagePicker` component (`components/admin/header-image-picker.tsx`) is similar but tuned for the wide 3:1 page header aspect ratio.

## Error Handling

- Client-side validation catches invalid types and oversized files before upload
- Upload errors show both a toast notification and an inline alert below the editor
- Errors are logged to `console.error` for debugging
- If the database insert fails after a successful storage upload, the storage file is cleaned up

## Storage Configuration

The bucket configuration lives in two places:

- **Local dev:** `supabase/config.toml` under `[storage.buckets.images]`
- **Production:** Applied via migration in `supabase/migrations/`

## Rider Submissions Bucket

The `rider-submissions` bucket stores GPX files and control card photos uploaded by riders through the self-service result submission flow.

- **Upload path:** Two-step signed URL flow in `lib/actions/rider-results.ts`:
  1. `createResultUploadUrl()` — service-role client validates token / size / content type and mints a one-time signed upload URL via `supabase.storage.from(...).createSignedUploadUrl(path)`
  2. Browser PUTs the file directly to Supabase Storage using `uploadToSignedUrl(path, token, file)`
  3. `confirmResultUpload()` — service-role client verifies the path is scoped to the event/rider, removes any prior file, and persists the new path
- **Why signed URLs:** Vercel caps Serverless Function request bodies at 4.5 MB (and Next.js Server Actions default to 1 MB). Direct-to-Storage uploads bypass both limits so we can support uploads well beyond either ceiling.
- **Access control:** Token-based (each result row has a unique `submission_token` UUID); both server actions validate the token before issuing or confirming an upload
- **RLS policies:** Public read (the bucket is public), no anonymous insert — uploads happen via service-role-issued signed URLs
- **Allowed types:** JPEG, PNG, WebP, HEIC/HEIF (converted to JPEG client-side), GPX/XML
- **Max size:**
  - **Photos (control cards):** 10 MB. In practice browser-side compression brings typical phone photos down to ~1–2 MB, so the 10 MB ceiling is a backstop.
  - **GPX files:** 100 MB. A 600 km brevet recorded at 1 Hz can easily exceed 30 MB; 1000 km+ randonnées can be much larger. The matching Supabase bucket-level cap is set in `supabase/migrations/20260407120000_raise_rider_submissions_size_limit.sql`.
- **File path pattern:** `{eventId}/{riderId}/{fileType}-{timestamp}-{randomId}.{ext}`

## Testing

- Server action tests: `tests/integration/actions/images.test.ts`
- Editor component tests: `tests/unit/components/markdown-editor.test.tsx`
- Bucket policy tests: `tests/integration-real/rider-submissions-bucket-policy.test.ts`
