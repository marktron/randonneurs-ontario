# File Uploads

The admin interface supports uploading files (images and documents) to Supabase Storage via the `images` bucket.

## Supported File Types

| Category  | Types                                   | Max Size |
| --------- | --------------------------------------- | -------- |
| Images    | JPEG, PNG, WebP, GIF                    | 10MB     |
| Documents | PDF                                     | 10MB     |
| Office    | Word (.doc, .docx), Excel (.xls, .xlsx) | 10MB     |

## How It Works

### Signed-URL Upload Flow

`lib/actions/images.ts` exposes a two-step signed-URL flow that bypasses Vercel's 4.5 MB Server Action body limit so the full 10 MB ceiling stays usable end-to-end:

1. **`createImageUploadUrl({ filename, contentType, sizeBytes, folder })`** — admin-only. Validates the input, generates a unique storage path under one of the allowed folders (`general`, `events`, `pages`, `headers`), and mints a one-time signed upload URL via `supabase.storage.from('images').createSignedUploadUrl(path)`. Returns `{ signedUrl, uploadToken, storagePath, publicUrl }`.
2. **Browser uploads directly** to Supabase Storage using `supabase.storage.from('images').uploadToSignedUrl(storagePath, uploadToken, file)`.
3. **`confirmImageUpload({ storagePath, filename, contentType, sizeBytes, altText })`** — admin-only. Re-validates the storage path against the allowed folder list, inserts the metadata row in the `images` table, and returns the full `UploadedFile` record. If the database insert fails the uploaded object is removed to avoid orphaning storage.

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
- **Why signed URLs:** Vercel caps Serverless Function request bodies at 4.5 MB (and Next.js Server Actions default to 1 MB). Direct-to-Storage uploads bypass both limits so we can keep the full 10 MB file ceiling.
- **Access control:** Token-based (each result row has a unique `submission_token` UUID); both server actions validate the token before issuing or confirming an upload
- **RLS policies:** Public read (the bucket is public), no anonymous insert — uploads happen via service-role-issued signed URLs
- **Allowed types:** JPEG, PNG, WebP, GPX/XML
- **Max size:** 10MB
- **File path pattern:** `{eventId}/{riderId}/{fileType}-{timestamp}-{randomId}.{ext}`

## Testing

- Server action tests: `tests/integration/actions/images.test.ts`
- Editor component tests: `tests/unit/components/markdown-editor.test.tsx`
- Bucket policy tests: `tests/integration-real/rider-submissions-bucket-policy.test.ts`
