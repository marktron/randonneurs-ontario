'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import type { ActionResult } from '@/types/actions'

const BUCKET_NAME = 'images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export interface UploadedImage {
  id: string
  url: string
  storagePath: string
  filename: string
  altText: string | null
  contentType: string
  sizeBytes: number
}

export interface ImageMetadata {
  id: string
  storagePath: string
  filename: string
  altText: string | null
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: string
  url: string
}

/**
 * Upload an image to Supabase Storage
 */
export async function uploadImage(
  formData: FormData
): Promise<ActionResult<UploadedImage>> {
  try {
    const admin = await requireAdmin()

    const file = formData.get('file') as File | null
    const altText = formData.get('altText') as string | null
    const folder = formData.get('folder') as string || 'general'

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`
      }
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
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
      console.error('Storage upload error:', uploadError)
      return { success: false, error: 'Failed to upload image' }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath)

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
      console.error('Database insert error:', dbError)
      // Try to clean up the uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([storagePath])
      return { success: false, error: 'Failed to save image metadata' }
    }

    revalidatePath('/admin/images')

    return {
      success: true,
      data: {
        id: imageRecord.id,
        url: urlData.publicUrl,
        storagePath,
        filename: file.name,
        altText: altText || null,
        contentType: file.type,
        sizeBytes: file.size,
      },
    }
  } catch (error) {
    console.error('Error in uploadImage:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Delete an image from storage and database
 */
export async function deleteImage(imageId: string): Promise<ActionResult> {
  try {
    await requireAdmin()

    const supabase = getSupabaseAdmin()

    // Get the image metadata first
    const { data: image, error: fetchError } = await supabase
      .from('images')
      .select('storage_path')
      .eq('id', imageId)
      .single()

    if (fetchError || !image) {
      return { success: false, error: 'Image not found' }
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([image.storage_path])

    if (storageError) {
      console.error('Storage delete error:', storageError)
      // Continue to delete metadata even if storage delete fails
    }

    // Delete metadata from database
    const { error: dbError } = await supabase
      .from('images')
      .delete()
      .eq('id', imageId)

    if (dbError) {
      console.error('Database delete error:', dbError)
      return { success: false, error: 'Failed to delete image metadata' }
    }

    revalidatePath('/admin/images')

    return { success: true }
  } catch (error) {
    console.error('Error in deleteImage:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Update image alt text
 */
export async function updateImageAltText(
  imageId: string,
  altText: string
): Promise<ActionResult> {
  try {
    await requireAdmin()

    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('images')
      .update({ alt_text: altText || null })
      .eq('id', imageId)

    if (error) {
      console.error('Error updating alt text:', error)
      return { success: false, error: 'Failed to update alt text' }
    }

    revalidatePath('/admin/images')

    return { success: true }
  } catch (error) {
    console.error('Error in updateImageAltText:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get all images with metadata
 */
export async function getImages(): Promise<ImageMetadata[]> {
  const supabase = getSupabaseAdmin()

  const { data: images, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !images) {
    console.error('Error fetching images:', error)
    return []
  }

  return images.map((img) => {
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(img.storage_path)

    return {
      id: img.id,
      storagePath: img.storage_path,
      filename: img.filename,
      altText: img.alt_text,
      contentType: img.content_type,
      sizeBytes: img.size_bytes,
      width: img.width,
      height: img.height,
      createdAt: img.created_at,
      url: urlData.publicUrl,
    }
  })
}

/**
 * Get a single image by ID
 */
export async function getImage(imageId: string): Promise<ImageMetadata | null> {
  const supabase = getSupabaseAdmin()

  const { data: img, error } = await supabase
    .from('images')
    .select('*')
    .eq('id', imageId)
    .single()

  if (error || !img) {
    return null
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(img.storage_path)

  return {
    id: img.id,
    storagePath: img.storage_path,
    filename: img.filename,
    altText: img.alt_text,
    contentType: img.content_type,
    sizeBytes: img.size_bytes,
    width: img.width,
    height: img.height,
    createdAt: img.created_at,
    url: urlData.publicUrl,
  }
}
