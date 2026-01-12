'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/actions'

const BUCKET_NAME = 'rider-submissions'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_GPX_TYPES = ['application/gpx+xml', 'application/xml', 'text/xml']

export interface ResultSubmissionData {
  eventId: string
  eventName: string
  eventDate: string
  eventDistance: number
  chapterName: string
  riderName: string
  riderEmail: string
  currentStatus: string
  finishTime: string | null
  gpxUrl: string | null
  gpxFilePath: string | null
  controlCardFrontPath: string | null
  controlCardBackPath: string | null
  riderNotes: string | null
  submittedAt: string | null
  canSubmit: boolean // false if event is already 'submitted'
}

/**
 * Get result data by submission token. No authentication required.
 */
export async function getResultByToken(
  token: string
): Promise<ActionResult<ResultSubmissionData>> {
  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  const supabase = getSupabaseAdmin()

  // Fetch result with event and rider details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase.from('results') as any)
    .select(`
      id,
      event_id,
      rider_id,
      status,
      finish_time,
      gpx_url,
      gpx_file_path,
      control_card_front_path,
      control_card_back_path,
      rider_notes,
      submitted_at,
      events (
        id,
        name,
        event_date,
        distance_km,
        status,
        chapters (name)
      ),
      riders (
        first_name,
        last_name,
        email
      )
    `)
    .eq('submission_token', token)
    .single()

  if (error || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  const event = result.events
  const rider = result.riders

  if (!event || !rider) {
    return { success: false, error: 'Invalid result data' }
  }

  // Check if event allows submissions (not yet submitted to ACP)
  const canSubmit = event.status !== 'submitted'

  return {
    success: true,
    data: {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.event_date,
      eventDistance: event.distance_km,
      chapterName: event.chapters?.name || 'Randonneurs Ontario',
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email || '',
      currentStatus: result.status,
      finishTime: result.finish_time,
      gpxUrl: result.gpx_url,
      gpxFilePath: result.gpx_file_path,
      controlCardFrontPath: result.control_card_front_path,
      controlCardBackPath: result.control_card_back_path,
      riderNotes: result.rider_notes,
      submittedAt: result.submitted_at,
      canSubmit,
    },
  }
}

export interface SubmitResultInput {
  token: string
  status: 'finished' | 'dnf' | 'dns'
  finishTime?: string | null // HH:MM or HHH:MM format for elapsed time
  gpxUrl?: string | null
  riderNotes?: string | null
}

/**
 * Submit result data (status, finish time, GPX URL, notes). No authentication required.
 */
export async function submitRiderResult(
  input: SubmitResultInput
): Promise<ActionResult> {
  const { token, status, finishTime, gpxUrl, riderNotes } = input

  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  if (!['finished', 'dnf', 'dns'].includes(status)) {
    return { success: false, error: 'Invalid status' }
  }

  // Validate finish time if status is finished
  if (status === 'finished') {
    if (!finishTime) {
      return { success: false, error: 'Finish time is required for finished rides' }
    }
    // Validate format: H:MM, HH:MM, or HHH:MM (for very long rides)
    if (!/^\d{1,3}:\d{2}$/.test(finishTime)) {
      return { success: false, error: 'Invalid finish time format. Use HH:MM (e.g., 13:30 or 105:45)' }
    }
  }

  const supabase = getSupabaseAdmin()

  // First, verify the token and check event status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error: fetchError } = await (supabase.from('results') as any)
    .select('id, events(status)')
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  if (result.events?.status === 'submitted') {
    return { success: false, error: 'Results have already been submitted to ACP. Contact your chapter VP for changes.' }
  }

  // Update the result
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase.from('results') as any)
    .update({
      status,
      finish_time: status === 'finished' ? finishTime : null,
      gpx_url: gpxUrl || null,
      rider_notes: riderNotes || null,
      submitted_at: new Date().toISOString(),
    })
    .eq('submission_token', token)

  if (updateError) {
    console.error('Error updating result:', updateError)
    return { success: false, error: 'Failed to submit result' }
  }

  return { success: true }
}

/**
 * Upload a file (GPX or control card photo) for a result. No authentication required.
 */
export async function uploadResultFile(
  token: string,
  fileType: 'gpx' | 'control_card_front' | 'control_card_back',
  formData: FormData
): Promise<ActionResult<{ path: string; url: string }>> {
  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return { success: false, error: 'No file provided' }
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File too large. Maximum size is 10MB.' }
  }

  // Validate file type
  const allowedTypes = fileType === 'gpx' ? ALLOWED_GPX_TYPES : ALLOWED_IMAGE_TYPES
  if (!allowedTypes.includes(file.type)) {
    const typeDescription = fileType === 'gpx' ? 'GPX/XML' : 'image (JPEG, PNG, WebP)'
    return { success: false, error: `Invalid file type. Please upload a ${typeDescription} file.` }
  }

  const supabase = getSupabaseAdmin()

  // Verify the token and get result ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error: fetchError } = await (supabase.from('results') as any)
    .select('id, event_id, rider_id, events(status)')
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  if (result.events?.status === 'submitted') {
    return { success: false, error: 'Results have already been submitted. Contact your chapter VP for changes.' }
  }

  // Generate unique file path
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)
  const ext = file.name.split('.').pop()?.toLowerCase() || (fileType === 'gpx' ? 'gpx' : 'jpg')
  const filePath = `${result.event_id}/${result.rider_id}/${fileType}-${timestamp}-${randomId}.${ext}`

  // Convert File to ArrayBuffer for upload
  const arrayBuffer = await file.arrayBuffer()
  const fileBuffer = new Uint8Array(arrayBuffer)

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('Error uploading file:', uploadError)
    return { success: false, error: 'Failed to upload file' }
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)
  const publicUrl = urlData.publicUrl

  // Update the result with the file path
  const updateField = fileType === 'gpx'
    ? { gpx_file_path: filePath }
    : fileType === 'control_card_front'
      ? { control_card_front_path: filePath }
      : { control_card_back_path: filePath }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase.from('results') as any)
    .update(updateField)
    .eq('submission_token', token)

  if (updateError) {
    console.error('Error updating result with file path:', updateError)
    // Try to clean up the uploaded file
    await supabase.storage.from(BUCKET_NAME).remove([filePath])
    return { success: false, error: 'Failed to save file reference' }
  }

  return {
    success: true,
    data: { path: filePath, url: publicUrl },
  }
}

/**
 * Delete an uploaded file from a result. No authentication required.
 */
export async function deleteResultFile(
  token: string,
  fileType: 'gpx' | 'control_card_front' | 'control_card_back'
): Promise<ActionResult> {
  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  const supabase = getSupabaseAdmin()

  // Get the current file path
  const pathField = fileType === 'gpx'
    ? 'gpx_file_path'
    : fileType === 'control_card_front'
      ? 'control_card_front_path'
      : 'control_card_back_path'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error: fetchError } = await (supabase.from('results') as any)
    .select(`id, ${pathField}, events(status)`)
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  if (result.events?.status === 'submitted') {
    return { success: false, error: 'Results have already been submitted. Contact your chapter VP for changes.' }
  }

  const filePath = result[pathField]
  if (!filePath) {
    return { success: true } // No file to delete
  }

  // Delete from storage
  const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove([filePath])

  if (deleteError) {
    console.error('Error deleting file:', deleteError)
    // Continue anyway to clear the reference
  }

  // Clear the file path in the database
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase.from('results') as any)
    .update({ [pathField]: null })
    .eq('submission_token', token)

  if (updateError) {
    console.error('Error clearing file path:', updateError)
    return { success: false, error: 'Failed to clear file reference' }
  }

  return { success: true }
}
