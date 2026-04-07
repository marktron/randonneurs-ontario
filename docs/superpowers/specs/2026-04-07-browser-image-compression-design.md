# Browser-Side Image Compression for Uploads

Date: 2026-04-07

## Goal

Replace the hard 10 MB image size cap on every upload site with browser-side resize and re-encode, so users can upload photos straight from a phone without hitting size limits or needing to convert HEIC files manually.

## Background

After migrating uploads to a signed-URL flow (see the rider-results and admin upload paths), the architectural 4.5 MB Vercel body limit no longer applies — files can in principle be up to 10 MB. But:

- Modern phone photos are routinely 3–8 MB and getting larger.
- iPhones default to HEIC in many regions; HEIC is currently rejected outright by `lib/actions/images.ts` and `lib/actions/rider-results.ts`.
- We're storing way more pixels than any of our display contexts actually use. Hero images render at ~1920 px wide; control card photos only need to be readable.

Rather than ratcheting the cap higher and shipping huge files to users on slow connections, we resize and re-encode in the browser before uploading.

## Scope

Applies to **all four** client upload sites that handle images:

- `components/result-submission-form.tsx` (rider control card photos, GPX files)
- `components/admin/image-upload.tsx` (event hero images, generic page images)
- `components/admin/header-image-picker.tsx` (page header 3:1 images)
- `components/admin/markdown-editor.tsx` (markdown content images **and** documents)

Non-image files (PDF, DOCX, XLSX, GPX, XML) pass through unchanged. Server-side validation, the signed-URL flow, and the 10 MB ceiling on the server stay exactly as they are — this is purely a client-side preprocessing step.

## Architecture

A new client-only module `lib/image-compression.ts` exports a single function:

```ts
export interface CompressOptions {
  maxWidthOrHeight?: number // default 2400
  maxSizeMB?: number // default 2
  quality?: number // default 0.85
}

export async function compressImageForUpload(file: File, options?: CompressOptions): Promise<File>
```

It uses **`browser-image-compression`** (~50 KB, runs in a Web Worker, handles EXIF Orientation automatically) for resize and re-encode, and **`heic2any`** (~150 KB) loaded via `await import('heic2any')` only when a HEIC/HEIF file is detected. Non-HEIC uploads pay zero bundle cost for HEIC support.

Each upload site adds one line before its existing signed-URL flow:

```ts
const compressed = await compressImageForUpload(file)
// existing createImageUploadUrl / uploadToSignedUrl / confirmImageUpload flow,
// passing `compressed` instead of `file`
```

The server-side flow stays unchanged. The server still receives a normal image file — just smaller.

## Behavior

`compressImageForUpload` follows this decision tree:

**Compressible image types** are exactly `image/jpeg`, `image/png`, `image/webp`, `image/heic`, and `image/heif`. Everything else — documents, GPX, XML, **and `image/gif`** — passes through unchanged. (GIFs are excluded because canvas-based re-encoding loses animation; preserving the original is the right call.)

1. **File over 25 MB pre-check** → throw a friendly error before loading anything into a canvas. Avoids browser OOM on accidental ProRAW or video uploads.
2. **Not a compressible image type** (PDF, DOCX, GPX, XML, GIF, etc.) → return the file unchanged.
3. **HEIC / HEIF** → `await import('heic2any')`, convert the blob to JPEG with `quality: 0.92`, wrap it in a new `File` with the extension rewritten to `.jpg`, then proceed to step 5.
4. **Small JPEG/PNG/WebP (< 500 KB)** → return unchanged. Already small enough; skip the work.
5. **Otherwise** → run `browser-image-compression` with `maxWidthOrHeight: 2400`, `maxSizeMB: 2`, `initialQuality: 0.85`, `useWebWorker: true`, `fileType: 'image/jpeg'`. Returns a new `File`.

**Compression target rationale (Option B from brainstorming):** max dimension 2400 px gives a comfortable downscale from a 12 MP iPhone photo (4032 × 3024 → ~2400 × 1800), control card handwriting stays legible, and the resulting ~2 MB sits well below the 4.5 MB Vercel cap with headroom to spare.

**EXIF orientation:** `browser-image-compression` reads the EXIF Orientation tag and bakes the correct rotation into the output pixels. Important for control card photos shot in portrait/landscape on iPhones.

**Error handling:** If compression or HEIC conversion throws, `compressImageForUpload` re-throws with a friendly message (`"We couldn't process this image. Please try a different file."`). Each upload site already has try/catch around its upload call, so the error surfaces in the existing toast or inline-alert path. **No silent fallback to the original file** — uploading a 12 MB file that failed compression would just fail server-side validation with a less helpful message.

## Tests

A new file `tests/unit/lib/image-compression.test.ts` covers the utility in isolation. Mocks `browser-image-compression` and `heic2any` so tests don't actually decode pixels.

- Pass-through for `application/pdf`
- Pass-through for `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Pass-through for `application/gpx+xml`
- Pass-through for `image/gif` (preserves animation)
- Pass-through for a small (< 500 KB) JPEG (asserts the underlying compression library is **not** called)
- Compresses a large JPEG — asserts the library is called with `{ maxWidthOrHeight: 2400, maxSizeMB: 2, initialQuality: 0.85, useWebWorker: true, fileType: 'image/jpeg' }`
- Converts an `image/heic` file: asserts `heic2any` was dynamically imported, the resulting `File` has `type: 'image/jpeg'` and a `.jpg` filename
- Rejects a 30 MB file with the pre-check error
- Re-throws a friendly error when `browser-image-compression` rejects
- Honours custom `CompressOptions` overrides

The four client component test files (`result-submission-form.test.tsx`, `markdown-editor.test.tsx`) get a small mock for `@/lib/image-compression` so existing tests still pass without doing real compression. The `image-upload.tsx` and `header-image-picker.tsx` components currently have no unit tests; this design does not add any to keep scope tight.

## Dependencies

Two new direct dependencies:

- `browser-image-compression` — 50 KB minified+gz, MIT, well-maintained, pure client-side
- `heic2any` — 150 KB minified+gz, MIT. **Loaded via dynamic import**, so only present in the bundle when a user actually drops a HEIC file

Both go in `dependencies` (not `devDependencies`) since they ship to the browser.

## Out of scope

- Changing the server-side `MAX_FILE_SIZE` ceiling. It stays at 10 MB as a backstop.
- Per-site compression settings. All four sites use the defaults; this can be revisited if a specific site needs different behavior.
- Image format negotiation (WebP vs JPEG output). Always JPEG for now — universal browser support, smaller than PNG for photos, simpler test surface.
- Server-side image processing or thumbnail generation. Not needed; the compressed file IS the stored file.
- Compression UI feedback (progress bar, before/after size display). The existing "Uploading…" spinner is enough for now.
