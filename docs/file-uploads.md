# File Uploads

The admin interface supports uploading files (images and documents) to Supabase Storage via the `images` bucket.

## Supported File Types

| Category  | Types                                   | Max Size |
| --------- | --------------------------------------- | -------- |
| Images    | JPEG, PNG, WebP, GIF                    | 10MB     |
| Documents | PDF                                     | 10MB     |
| Office    | Word (.doc, .docx), Excel (.xls, .xlsx) | 10MB     |

## How It Works

### Server Action

`lib/actions/images.ts` exports `uploadFile()` (aliased as `uploadImage()` for backwards compatibility).

The action:

1. Validates file type and size
2. Generates a unique filename with timestamp
3. Uploads to the `images` Supabase Storage bucket
4. Records metadata in the `images` database table
5. Returns the public URL

### Markdown Editor (Page Content)

The `MarkdownEditor` component (`components/admin/markdown-editor.tsx`) supports:

- **Drag and drop** any supported file onto the editor
- **Paste** images from clipboard
- Files are uploaded to the `pages/` folder in storage

Uploaded files are inserted as markdown:

- **Images** → `![filename](url)` (rendered inline)
- **Documents** → `[filename](url)` (rendered as download link)

A placeholder is shown during upload, and replaced with the final markdown on success or removed on failure.

### Header Image Picker

The `ImageUpload` component (`components/admin/image-upload.tsx`) provides a standalone drag-and-drop zone for uploading header images on events and pages. This only accepts image files.

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

- **Upload path:** `lib/actions/rider-results.ts` → `uploadResultFile()` using the service-role client
- **Access control:** Token-based (each result row has a unique `submission_token` UUID); the server action validates the token before uploading
- **RLS policies:** Public read (the bucket is public), no anonymous insert — only the service-role client can write
- **Allowed types:** JPEG, PNG, WebP, GPX/XML
- **Max size:** 10MB
- **File path pattern:** `{eventId}/{riderId}/{fileType}-{timestamp}-{randomId}.{ext}`

## Testing

- Server action tests: `tests/integration/actions/images.test.ts`
- Editor component tests: `tests/unit/components/markdown-editor.test.tsx`
- Bucket policy tests: `tests/integration-real/rider-submissions-bucket-policy.test.ts`
