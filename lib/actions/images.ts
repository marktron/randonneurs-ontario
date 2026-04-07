'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { handleActionError, handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

const BUCKET_NAME = 'images'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

// Folder names allowed in storage paths. Keeps confirmImageUpload from being
// used to claim arbitrary paths inside the bucket. Add to this list as new
// upload locations appear.
const ALLOWED_FOLDERS = ['general', 'events', 'pages', 'headers']

export interface UploadedFile {
  id: string
  url: string
  storagePath: string
  filename: string
  altText: string | null
  contentType: string
  sizeBytes: number
}

export interface CreateImageUploadUrlInput {
  filename: string
  contentType: string
  sizeBytes: number
  folder?: string
}

export interface CreateImageUploadUrlData {
  signedUrl: string
  uploadToken: string
  storagePath: string
  publicUrl: string
}

/**
 * Mint a one-time signed upload URL for an image or document. The browser
 * uploads directly to Supabase Storage with this URL, bypassing Next.js
 * Server Action body limits and Vercel's 4.5 MB request body cap.
 *
 * After the upload finishes, callers must invoke confirmImageUpload to
 * persist the metadata row in the images table.
 *
 * Admin only.
 */
export async function createImageUploadUrl(
  input: CreateImageUploadUrlInput
): Promise<ActionResult<CreateImageUploadUrlData>> {
  try {
    await requireAdmin()

    const { filename, contentType, sizeBytes } = input
    const folder = input.folder || 'general'

    if (!filename) {
      return { success: false, error: 'No filename provided' }
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return { success: false, error: `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(', ')}` }
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        success: false,
        error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      }
    }

    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
      return { success: false, error: 'Invalid file size' }
    }

    if (sizeBytes > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    }

    const ext = sanitizeExtension(filename)
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const storagePath = `${folder}/${timestamp}-${randomId}.${ext}`

    const supabase = getSupabaseAdmin()

    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath)

    if (signError || !signedData) {
      return handleSupabaseError(
        signError,
        { operation: 'createImageUploadUrl.sign' },
        'Failed to create upload URL'
      )
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath)

    return createActionResult({
      signedUrl: signedData.signedUrl,
      uploadToken: signedData.token,
      storagePath,
      publicUrl: urlData.publicUrl,
    })
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'createImageUploadUrl' },
      'An unexpected error occurred'
    )
  }
}

export interface ConfirmImageUploadInput {
  storagePath: string
  filename: string
  contentType: string
  sizeBytes: number
  altText?: string | null
}

/**
 * Persist an uploaded file's metadata in the images table after the browser
 * has finished uploading directly to Supabase Storage via the signed URL from
 * createImageUploadUrl. If the database insert fails the uploaded file is
 * removed to avoid orphaning storage.
 *
 * Admin only.
 */
export async function confirmImageUpload(
  input: ConfirmImageUploadInput
): Promise<ActionResult<UploadedFile>> {
  try {
    const admin = await requireAdmin()

    const { storagePath, filename, contentType, sizeBytes, altText } = input

    if (!isValidStoragePath(storagePath)) {
      return { success: false, error: 'Invalid storage path' }
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        success: false,
        error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      }
    }

    if (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
      return { success: false, error: 'Invalid file size' }
    }

    const supabase = getSupabaseAdmin()

    const { data: imageRecord, error: dbError } = await supabase
      .from('images')
      .insert({
        storage_path: storagePath,
        filename,
        alt_text: altText || null,
        content_type: contentType,
        size_bytes: sizeBytes,
        uploaded_by: admin.id,
      })
      .select('id')
      .single()

    if (dbError || !imageRecord) {
      // Clean up the uploaded file so we don't orphan storage
      const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath])
      if (removeError) {
        logError(removeError, {
          operation: 'confirmImageUpload.cleanup',
          context: { storagePath },
        })
      }
      return handleSupabaseError(
        dbError,
        { operation: 'confirmImageUpload.database' },
        'Failed to save file metadata'
      )
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath)

    return createActionResult({
      id: imageRecord.id,
      url: urlData.publicUrl,
      storagePath,
      filename,
      altText: altText || null,
      contentType,
      sizeBytes,
    })
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'confirmImageUpload' },
      'An unexpected error occurred'
    )
  }
}

function sanitizeExtension(filename: string): string {
  const raw = filename.split('.').pop()?.toLowerCase() || ''
  const safe = raw.replace(/[^a-z0-9]/g, '')
  return safe || 'bin'
}

function isValidStoragePath(path: string): boolean {
  if (!path) return false
  // No path traversal, no leading slash, must be inside an allowed folder
  if (path.includes('..') || path.startsWith('/')) return false
  const [folder] = path.split('/')
  return ALLOWED_FOLDERS.includes(folder)
}
