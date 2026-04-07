# Browser-Side Image Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `compressImageForUpload` utility that resizes/re-encodes large images and converts HEIC to JPEG in the browser, then call it from all four upload sites so users can upload phone photos without hitting the 10 MB ceiling.

**Architecture:** A single client-only module `lib/image-compression.ts` exposes one function. It uses `browser-image-compression` for resize/encode (Web Worker, EXIF orientation), and lazy-loads `heic2any` only when a HEIC/HEIF file is detected. Each upload site adds one call before its existing signed-URL flow. Server-side validation and the signed-URL actions are unchanged.

**Tech Stack:** TypeScript, Next.js (App Router), Vitest + happy-dom, browser-image-compression, heic2any.

**Spec:** `docs/superpowers/specs/2026-04-07-browser-image-compression-design.md`

---

## File Structure

**Create:**

- `lib/image-compression.ts` — the `compressImageForUpload` function
- `tests/unit/lib/image-compression.test.ts` — unit tests with mocked libraries

**Modify:**

- `package.json` / `package-lock.json` — add `browser-image-compression` and `heic2any` deps
- `components/result-submission-form.tsx` — call `compressImageForUpload` inside `handleFileUpload`
- `components/admin/image-upload.tsx` — call `compressImageForUpload` inside `handleUpload`
- `components/admin/header-image-picker.tsx` — call `compressImageForUpload` inside `handleImageUpload`
- `components/admin/markdown-editor.tsx` — call `compressImageForUpload` inside `handleFileUpload`
- `tests/unit/components/result-submission-form.test.tsx` — mock `@/lib/image-compression`
- `tests/unit/components/markdown-editor.test.tsx` — mock `@/lib/image-compression`

---

## Task 1: Install dependencies

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install browser-image-compression and heic2any**

Run:

```bash
npm install browser-image-compression heic2any
```

Expected: both packages added to `dependencies` in `package.json`, `package-lock.json` updated, no errors.

- [ ] **Step 2: Verify TypeScript types resolve**

Run:

```bash
npm run typecheck
```

Expected: clean (no errors). Both packages ship their own type definitions; we don't need `@types/*` packages.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add browser-image-compression and heic2any dependencies"
```

---

## Task 2: Write failing tests for compressImageForUpload

**Files:**

- Create: `tests/unit/lib/image-compression.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/unit/lib/image-compression.test.ts` with this exact content:

```ts
/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the underlying libraries before importing the module under test
vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}))

vi.mock('heic2any', () => ({
  default: vi.fn(),
}))

import imageCompression from 'browser-image-compression'
import heic2any from 'heic2any'
import { compressImageForUpload } from '@/lib/image-compression'

const mockedCompression = vi.mocked(imageCompression)
const mockedHeic2any = vi.mocked(heic2any)

function createMockFile(name: string, type: string, size: number): File {
  const file = new File([''], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('compressImageForUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCompression.mockResolvedValue(createMockFile('compressed.jpg', 'image/jpeg', 500_000))
    mockedHeic2any.mockResolvedValue(new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }))
  })

  describe('pass-through cases', () => {
    it('returns PDF files unchanged', async () => {
      const pdf = createMockFile('doc.pdf', 'application/pdf', 1_000_000)
      const result = await compressImageForUpload(pdf)
      expect(result).toBe(pdf)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns Word documents unchanged', async () => {
      const docx = createMockFile(
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        2_000_000
      )
      const result = await compressImageForUpload(docx)
      expect(result).toBe(docx)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns GPX files unchanged', async () => {
      const gpx = createMockFile('ride.gpx', 'application/gpx+xml', 100_000)
      const result = await compressImageForUpload(gpx)
      expect(result).toBe(gpx)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns GIF files unchanged (preserves animation)', async () => {
      const gif = createMockFile('cat.gif', 'image/gif', 800_000)
      const result = await compressImageForUpload(gif)
      expect(result).toBe(gif)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns small JPEG files unchanged', async () => {
      const small = createMockFile('thumb.jpg', 'image/jpeg', 200_000) // 200 KB
      const result = await compressImageForUpload(small)
      expect(result).toBe(small)
      expect(mockedCompression).not.toHaveBeenCalled()
    })
  })

  describe('compression', () => {
    it('compresses a large JPEG with the default options', async () => {
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000) // 5 MB

      const result = await compressImageForUpload(large)

      expect(mockedCompression).toHaveBeenCalledTimes(1)
      expect(mockedCompression).toHaveBeenCalledWith(large, {
        maxWidthOrHeight: 2400,
        maxSizeMB: 2,
        initialQuality: 0.85,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
      expect(result.type).toBe('image/jpeg')
    })

    it('compresses a large PNG', async () => {
      const png = createMockFile('screenshot.png', 'image/png', 4_000_000)
      await compressImageForUpload(png)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })

    it('compresses a large WebP', async () => {
      const webp = createMockFile('image.webp', 'image/webp', 3_000_000)
      await compressImageForUpload(webp)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })

    it('honours custom CompressOptions overrides', async () => {
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000)

      await compressImageForUpload(large, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        quality: 0.75,
      })

      expect(mockedCompression).toHaveBeenCalledWith(large, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        initialQuality: 0.75,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
    })
  })

  describe('HEIC conversion', () => {
    it('converts HEIC to JPEG and then compresses', async () => {
      const heic = createMockFile('IMG_1234.heic', 'image/heic', 3_500_000)

      const result = await compressImageForUpload(heic)

      expect(mockedHeic2any).toHaveBeenCalledTimes(1)
      expect(mockedHeic2any).toHaveBeenCalledWith({
        blob: heic,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      // After HEIC conversion the working file is JPEG, then compression runs
      expect(mockedCompression).toHaveBeenCalledTimes(1)
      const passedFile = mockedCompression.mock.calls[0][0] as File
      expect(passedFile.type).toBe('image/jpeg')
      expect(passedFile.name).toBe('IMG_1234.jpg')
      expect(result.type).toBe('image/jpeg')
    })

    it('converts HEIF to JPEG and then compresses', async () => {
      const heif = createMockFile('photo.heif', 'image/heif', 3_500_000)

      await compressImageForUpload(heif)

      expect(mockedHeic2any).toHaveBeenCalledTimes(1)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
      const passedFile = mockedCompression.mock.calls[0][0] as File
      expect(passedFile.type).toBe('image/jpeg')
      expect(passedFile.name).toBe('photo.jpg')
    })

    it('handles heic2any returning an array of blobs', async () => {
      mockedHeic2any.mockResolvedValueOnce([
        new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }),
      ])
      const heic = createMockFile('IMG_5678.heic', 'image/heic', 3_500_000)

      await compressImageForUpload(heic)

      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })
  })

  describe('pre-check', () => {
    it('rejects files larger than 25 MB before touching any decoder', async () => {
      const huge = createMockFile('insane.jpg', 'image/jpeg', 30 * 1024 * 1024) // 30 MB

      await expect(compressImageForUpload(huge)).rejects.toThrow(/too large/i)
      expect(mockedCompression).not.toHaveBeenCalled()
      expect(mockedHeic2any).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('re-throws a friendly error when browser-image-compression fails', async () => {
      mockedCompression.mockRejectedValueOnce(new Error('decode failed'))
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000)

      await expect(compressImageForUpload(large)).rejects.toThrow(/couldn.?t process this image/i)
    })

    it('re-throws a friendly error when heic2any fails', async () => {
      mockedHeic2any.mockRejectedValueOnce(new Error('not actually heic'))
      const heic = createMockFile('IMG_9999.heic', 'image/heic', 3_500_000)

      await expect(compressImageForUpload(heic)).rejects.toThrow(/couldn.?t process this image/i)
    })
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```bash
npx vitest run tests/unit/lib/image-compression.test.ts
```

Expected: All tests fail with `Cannot find module '@/lib/image-compression'` (or similar resolution error).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/lib/image-compression.test.ts
git commit -m "Add failing tests for compressImageForUpload utility"
```

---

## Task 3: Implement compressImageForUpload

**Files:**

- Create: `lib/image-compression.ts`

- [ ] **Step 1: Create the implementation**

Create `lib/image-compression.ts` with this exact content:

```ts
/**
 * Browser-side image compression for upload flows.
 *
 * Resizes and re-encodes large photos to keep uploaded files small, and
 * converts HEIC/HEIF (iPhone defaults in many regions) to JPEG so non-Safari
 * browsers can handle them. Non-image files (PDF, DOCX, GPX, XML, GIF) pass
 * through unchanged.
 *
 * Uses browser-image-compression for the resize/encode (runs in a Web Worker
 * and bakes EXIF orientation into the output pixels). heic2any is loaded via
 * dynamic import so non-HEIC uploads pay zero bundle cost for HEIC support.
 */

import imageCompression from 'browser-image-compression'

const COMPRESSIBLE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

const HEIC_MIME_TYPES = ['image/heic', 'image/heif']

const MAX_INPUT_BYTES = 25 * 1024 * 1024 // 25 MB pre-check ceiling
const SKIP_BELOW_BYTES = 500 * 1024 // 500 KB — already small enough

export interface CompressOptions {
  /** Longest edge of the output image in pixels. Default 2400. */
  maxWidthOrHeight?: number
  /** Soft target output size in MB. Default 2. */
  maxSizeMB?: number
  /** JPEG quality between 0 and 1. Default 0.85. */
  quality?: number
}

const FRIENDLY_ERROR = "We couldn't process this image. Please try a different file."

/**
 * Compress an image file for upload. Returns a new File ready to upload.
 *
 * - Non-image files (PDF, DOCX, GPX, XML, GIF) → returned unchanged
 * - HEIC / HEIF → converted to JPEG via heic2any (lazy-loaded), then compressed
 * - Small JPEG/PNG/WebP (< 500 KB) → returned unchanged
 * - Otherwise → resized and re-encoded as JPEG
 *
 * Throws a friendly error message on any decoder/compression failure, or if
 * the input is larger than 25 MB.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `That file is too large to process in the browser (${Math.round(
        file.size / 1024 / 1024
      )} MB). Please choose a smaller file.`
    )
  }

  if (!COMPRESSIBLE_IMAGE_TYPES.includes(file.type)) {
    return file
  }

  let workingFile = file

  if (HEIC_MIME_TYPES.includes(file.type)) {
    try {
      const { default: heic2any } = await import('heic2any')
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted
      const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
      workingFile = new File([jpegBlob], jpegName, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      })
    } catch (error) {
      console.error('HEIC conversion failed:', error)
      throw new Error(FRIENDLY_ERROR)
    }
  } else if (workingFile.size < SKIP_BELOW_BYTES) {
    // Already small and not HEIC — no work to do
    return workingFile
  }

  const { maxWidthOrHeight = 2400, maxSizeMB = 2, quality = 0.85 } = options

  try {
    return await imageCompression(workingFile, {
      maxWidthOrHeight,
      maxSizeMB,
      initialQuality: quality,
      useWebWorker: true,
      fileType: 'image/jpeg',
    })
  } catch (error) {
    console.error('Image compression failed:', error)
    throw new Error(FRIENDLY_ERROR)
  }
}
```

- [ ] **Step 2: Run the tests to confirm they pass**

Run:

```bash
npx vitest run tests/unit/lib/image-compression.test.ts
```

Expected: All 15 tests pass.

- [ ] **Step 3: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/image-compression.ts
git commit -m "Add compressImageForUpload utility with HEIC support"
```

---

## Task 4: Wire compression into result-submission-form.tsx

**Files:**

- Modify: `components/result-submission-form.tsx`
- Modify: `tests/unit/components/result-submission-form.test.tsx`

- [ ] **Step 1: Add the mock to the existing test file**

In `tests/unit/components/result-submission-form.test.tsx`, just below the existing `vi.mock('@/lib/supabase-browser', ...)` block, add:

```ts
// Mock browser-side image compression — pass through unchanged in tests
vi.mock('@/lib/image-compression', () => ({
  compressImageForUpload: vi.fn(async (file: File) => file),
}))
```

- [ ] **Step 2: Run the existing test file to confirm the mock loads cleanly**

Run:

```bash
npx vitest run tests/unit/components/result-submission-form.test.tsx
```

Expected: all existing tests still pass (the mock just needs to resolve; the upload code path isn't exercised in happy-dom).

- [ ] **Step 3: Add the import in the component**

In `components/result-submission-form.tsx`, find the existing import block that includes:

```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
```

Add directly below it:

```ts
import { compressImageForUpload } from '@/lib/image-compression'
```

- [ ] **Step 4: Call the compressor at the top of handleFileUpload**

In `components/result-submission-form.tsx`, replace this block (around line 102):

```ts
  async function handleFileUpload(
    file: File,
    fileType: 'gpx' | 'control_card_front' | 'control_card_back',
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>
  ) {
    setState((prev) => ({ ...prev, uploading: true, error: null }))

    // 1. Ask the server for a signed upload URL (avoids the server-action body limit)
    const signed = await createResultUploadUrl({
      token,
      fileType,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    })
```

with:

```ts
  async function handleFileUpload(
    file: File,
    fileType: 'gpx' | 'control_card_front' | 'control_card_back',
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>
  ) {
    setState((prev) => ({ ...prev, uploading: true, error: null }))

    // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
    let uploadFile: File
    try {
      uploadFile = await compressImageForUpload(file)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      }))
      return
    }

    // 1. Ask the server for a signed upload URL (avoids the server-action body limit)
    const signed = await createResultUploadUrl({
      token,
      fileType,
      fileName: uploadFile.name,
      contentType: uploadFile.type,
      fileSize: uploadFile.size,
    })
```

- [ ] **Step 5: Replace the file references in the rest of handleFileUpload**

In the same function, replace this block:

```ts
// 2. Upload directly to Supabase Storage using the signed URL
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('rider-submissions')
  .uploadToSignedUrl(signed.data.path, signed.data.uploadToken, file, {
    contentType: file.type,
    upsert: false,
  })
```

with:

```ts
// 2. Upload directly to Supabase Storage using the signed URL
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('rider-submissions')
  .uploadToSignedUrl(signed.data.path, signed.data.uploadToken, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  })
```

- [ ] **Step 6: Run typecheck and the form's tests**

Run:

```bash
npm run typecheck && npx vitest run tests/unit/components/result-submission-form.test.tsx
```

Expected: typecheck clean, all existing form tests still pass.

- [ ] **Step 7: Commit**

```bash
git add components/result-submission-form.tsx tests/unit/components/result-submission-form.test.tsx
git commit -m "Compress rider control card photos in the browser before upload"
```

---

## Task 5: Wire compression into image-upload.tsx

**Files:**

- Modify: `components/admin/image-upload.tsx`

- [ ] **Step 1: Add the import**

In `components/admin/image-upload.tsx`, find the existing import block that includes:

```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
```

Add directly below it:

```ts
import { compressImageForUpload } from '@/lib/image-compression'
```

- [ ] **Step 2: Call the compressor at the top of handleUpload**

In the same file, find the `handleUpload` callback. Inside the `try` block, replace the existing first signed-URL request:

```ts
      try {
        // 1. Mint a signed upload URL (avoids the Server Action body limit)
        const signed = await createImageUploadUrl({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          folder,
        })
```

with:

```ts
      try {
        // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
        let uploadFile: File
        try {
          uploadFile = await compressImageForUpload(file)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to upload image')
          return
        }

        // 1. Mint a signed upload URL (avoids the Server Action body limit)
        const signed = await createImageUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          folder,
        })
```

- [ ] **Step 3: Replace the file references in the rest of handleUpload**

In the same function, replace this block:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, file, {
    contentType: file.type,
    upsert: false,
  })

if (uploadError) {
  setError(uploadError.message || 'Failed to upload image')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: file.name,
  contentType: file.type,
  sizeBytes: file.size,
  altText: altText || null,
})
```

with:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  })

if (uploadError) {
  setError(uploadError.message || 'Failed to upload image')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: uploadFile.name,
  contentType: uploadFile.type,
  sizeBytes: uploadFile.size,
  altText: altText || null,
})
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/image-upload.tsx
git commit -m "Compress admin event hero images in the browser before upload"
```

---

## Task 6: Wire compression into header-image-picker.tsx

**Files:**

- Modify: `components/admin/header-image-picker.tsx`

- [ ] **Step 1: Add the import**

In `components/admin/header-image-picker.tsx`, find the existing import block that includes:

```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
```

Add directly below it:

```ts
import { compressImageForUpload } from '@/lib/image-compression'
```

- [ ] **Step 2: Call the compressor at the top of the try block**

In the same file, find the `handleImageUpload` callback. Inside the `try` block, replace this:

```ts
      try {
        // 1. Mint a signed upload URL
        const signed = await createImageUploadUrl({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          folder: 'headers',
        })
```

with:

```ts
      try {
        // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
        let uploadFile: File
        try {
          uploadFile = await compressImageForUpload(file)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to upload image')
          return
        }

        // 1. Mint a signed upload URL
        const signed = await createImageUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          folder: 'headers',
        })
```

- [ ] **Step 3: Replace the file references in the rest of handleImageUpload**

In the same function, replace this block:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, file, {
    contentType: file.type,
    upsert: false,
  })

if (uploadError) {
  toast.error(uploadError.message || 'Failed to upload image')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: file.name,
  contentType: file.type,
  sizeBytes: file.size,
  altText: null,
})
```

with:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  })

if (uploadError) {
  toast.error(uploadError.message || 'Failed to upload image')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: uploadFile.name,
  contentType: uploadFile.type,
  sizeBytes: uploadFile.size,
  altText: null,
})
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/header-image-picker.tsx
git commit -m "Compress admin header images in the browser before upload"
```

---

## Task 7: Wire compression into markdown-editor.tsx

**Files:**

- Modify: `components/admin/markdown-editor.tsx`
- Modify: `tests/unit/components/markdown-editor.test.tsx`

- [ ] **Step 1: Add the mock to the existing test file**

In `tests/unit/components/markdown-editor.test.tsx`, just below the existing `vi.mock('@/lib/supabase-browser', ...)` block, add:

```ts
// Mock browser-side image compression — pass through unchanged in tests
vi.mock('@/lib/image-compression', () => ({
  compressImageForUpload: vi.fn(async (file: File) => file),
}))
```

- [ ] **Step 2: Run the existing test file to confirm the mock loads cleanly**

Run:

```bash
npx vitest run tests/unit/components/markdown-editor.test.tsx
```

Expected: all existing tests still pass.

- [ ] **Step 3: Add the import in the component**

In `components/admin/markdown-editor.tsx`, find the existing import block that includes:

```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
```

Add directly below it:

```ts
import { compressImageForUpload } from '@/lib/image-compression'
```

- [ ] **Step 4: Call the compressor at the top of the try block**

In the same file, find the `handleFileUpload` callback. Inside the `try` block, replace this:

```ts
      try {
        // 1. Mint a signed upload URL
        const signed = await createImageUploadUrl({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          folder: 'pages',
        })
```

with:

```ts
      try {
        // 0. Compress images in the browser before upload (HEIC → JPEG, resize).
        // Documents (PDF, DOCX, etc.) pass through unchanged.
        let uploadFile: File
        try {
          uploadFile = await compressImageForUpload(file)
        } catch (err) {
          failWith(err instanceof Error ? err.message : 'Failed to upload file')
          return
        }

        // 1. Mint a signed upload URL
        const signed = await createImageUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          folder: 'pages',
        })
```

- [ ] **Step 5: Replace the file references in the rest of handleFileUpload**

In the same function, replace this block:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, file, {
    contentType: file.type,
    upsert: false,
  })

if (uploadError) {
  failWith(uploadError.message || 'Failed to upload file')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: file.name,
  contentType: file.type,
  sizeBytes: file.size,
  altText: null,
})

if (!confirmed.success || !confirmed.data) {
  failWith(confirmed.error || 'Failed to upload file')
  return
}

const markdown = isImage
  ? `![${file.name}](${confirmed.data.url})`
  : `[${file.name}](${confirmed.data.url})`
onChange(valueRef.current.replace(uploadingPlaceholder, markdown))
toast.success(isImage ? 'Image uploaded' : 'File uploaded')
```

with:

```ts
// 2. Upload directly to Supabase Storage
const supabase = createSupabaseBrowserClient()
const { error: uploadError } = await supabase.storage
  .from('images')
  .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  })

if (uploadError) {
  failWith(uploadError.message || 'Failed to upload file')
  return
}

// 3. Persist metadata
const confirmed = await confirmImageUpload({
  storagePath: signed.data.storagePath,
  filename: uploadFile.name,
  contentType: uploadFile.type,
  sizeBytes: uploadFile.size,
  altText: null,
})

if (!confirmed.success || !confirmed.data) {
  failWith(confirmed.error || 'Failed to upload file')
  return
}

const markdown = isImage
  ? `![${uploadFile.name}](${confirmed.data.url})`
  : `[${uploadFile.name}](${confirmed.data.url})`
onChange(valueRef.current.replace(uploadingPlaceholder, markdown))
toast.success(isImage ? 'Image uploaded' : 'File uploaded')
```

- [ ] **Step 6: Verify typecheck and run the editor's tests**

Run:

```bash
npm run typecheck && npx vitest run tests/unit/components/markdown-editor.test.tsx
```

Expected: typecheck clean, all existing markdown-editor tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/admin/markdown-editor.tsx tests/unit/components/markdown-editor.test.tsx
git commit -m "Compress markdown editor image uploads in the browser"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test --silent
```

Expected: All test files pass. Test count should be **baseline + 15 new** (one new test file with 15 tests covering compressImageForUpload).

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Lint the changed files**

Run:

```bash
npx eslint lib/image-compression.ts tests/unit/lib/image-compression.test.ts components/result-submission-form.tsx components/admin/image-upload.tsx components/admin/header-image-picker.tsx components/admin/markdown-editor.tsx tests/unit/components/result-submission-form.test.tsx tests/unit/components/markdown-editor.test.tsx
```

Expected: 0 errors. Pre-existing warnings (e.g., the unused `waitFor` import in `markdown-editor.test.tsx`) are fine — only new errors are blockers.

- [ ] **Step 4: Update file-uploads.md to mention browser compression**

In `docs/file-uploads.md`, find the "How It Works" section and add this short subsection just above "Markdown Editor (Page Content)":

```markdown
### Browser-Side Compression

Before any image is uploaded, the browser runs `lib/image-compression.ts → compressImageForUpload()` on it:

- Non-image files (PDF, DOCX, GPX, GIF) pass through unchanged.
- HEIC/HEIF (iPhone photos) are converted to JPEG via a lazy-imported `heic2any`.
- JPEG/PNG/WebP files larger than 500 KB are resized to fit within 2400 px on the longest edge and re-encoded as JPEG with quality 0.85, targeting ~2 MB.
- Files larger than 25 MB are rejected up front to avoid browser OOM.

This means the 10 MB server-side ceiling on `lib/actions/images.ts` and `lib/actions/rider-results.ts` is effectively a backstop — typical phone photos arrive at ~1–2 MB.
```

- [ ] **Step 5: Commit the doc update**

```bash
git add docs/file-uploads.md
git commit -m "Document browser-side image compression in file-uploads docs"
```
