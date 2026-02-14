'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
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

export interface UploadedFile {
  id: string
  url: string
  storagePath: string
  filename: string
  altText: string | null
  contentType: string
  sizeBytes: number
}

/** @deprecated Use UploadedFile instead */
export type UploadedImage = UploadedFile

/**
 * Upload a file (image, PDF, or document) to Supabase Storage
 */
export async function uploadFile(formData: FormData): Promise<ActionResult<UploadedFile>> {
  try {
    const admin = await requireAdmin()

    const file = formData.get('file') as File | null
    const altText = formData.get('altText') as string | null
    const folder = (formData.get('folder') as string) || 'general'

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      }
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const storagePath = `${folder}/${timestamp}-${randomId}.${ext}`

    const supabase = getSupabaseAdmin()

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return handleSupabaseError(
        uploadError,
        { operation: 'uploadFile.storage' },
        'Failed to upload file'
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath)

    // Insert metadata into database
    const { data: imageRecord, error: dbError } = await supabase
      .from('images')
      .insert({
        storage_path: storagePath,
        filename: file.name,
        alt_text: altText || null,
        content_type: file.type,
        size_bytes: file.size,
        uploaded_by: admin.id,
      })
      .select('id')
      .single()

    if (dbError) {
      // Try to clean up the uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([storagePath])
      return handleSupabaseError(
        dbError,
        { operation: 'uploadFile.database' },
        'Failed to save file metadata'
      )
    }

    return createActionResult({
      id: imageRecord.id,
      url: urlData.publicUrl,
      storagePath,
      filename: file.name,
      altText: altText || null,
      contentType: file.type,
      sizeBytes: file.size,
    })
  } catch (error) {
    return handleActionError(error, { operation: 'uploadFile' }, 'An unexpected error occurred')
  }
}

/** @deprecated Use uploadFile instead */
export const uploadImage = uploadFile
