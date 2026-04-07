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
