'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type {
  ResultForSubmission,
  ResultWithEventStatus,
  ResultForFileUpload,
  ResultUpdate,
} from '@/types/queries'

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
  chapterSlug: string // For fetching suggested events
  riderId: string // For fetching upcoming registrations
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
export async function getResultByToken(token: string): Promise<ActionResult<ResultSubmissionData>> {
  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  const supabase = getSupabaseAdmin()

  // Fetch result with event and rider details
  const { data: result, error } = await supabase
    .from('results')
    .select(
      `
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
        chapters (name, slug)
      ),
      riders (
        id,
        first_name,
        last_name,
        email
      )
    `
    )
    .eq('submission_token', token)
    .single()

  if (error || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  const typedResult = result as ResultForSubmission & {
    riders: { id: string; first_name: string; last_name: string; email: string | null } | null
    events: {
      id: string
      name: string
      event_date: string
      distance_km: number
      status: string
      chapters: { name: string; slug: string } | null
    } | null
  }
  const event = typedResult.events
  const rider = typedResult.riders

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
      chapterSlug: event.chapters?.slug || '',
      riderId: rider.id,
      riderName: `${rider.first_name} ${rider.last_name}`,
      riderEmail: rider.email || '',
      currentStatus: typedResult.status ?? 'pending',
      finishTime: typedResult.finish_time,
      gpxUrl: typedResult.gpx_url,
      gpxFilePath: typedResult.gpx_file_path,
      controlCardFrontPath: typedResult.control_card_front_path,
      controlCardBackPath: typedResult.control_card_back_path,
      riderNotes: typedResult.rider_notes,
      submittedAt: typedResult.submitted_at,
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
export async function submitRiderResult(input: SubmitResultInput): Promise<ActionResult> {
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
      return {
        success: false,
        error: 'Invalid finish time format. Use HH:MM (e.g., 13:30 or 105:45)',
      }
    }
  }

  const supabase = getSupabaseAdmin()

  // First, verify the token and check event status
  const { data: result, error: fetchError } = await supabase
    .from('results')
    .select('id, events(status)')
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  const typedResult = result as ResultWithEventStatus

  if (typedResult.events?.status === 'submitted') {
    return {
      success: false,
      error: 'Results have already been submitted to ACP. Contact your chapter VP for changes.',
    }
  }

  // Update the result
  const updateData: ResultUpdate = {
    status,
    finish_time: status === 'finished' ? finishTime : null,
    gpx_url: gpxUrl || null,
    rider_notes: riderNotes || null,
    submitted_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('results')
    .update(updateData)
    .eq('submission_token', token)

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'submitResult' },
      'Failed to submit result'
    )
  }

  return createActionResult()
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
  const { data: result, error: fetchError } = await supabase
    .from('results')
    .select('id, event_id, rider_id, events(status)')
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  const typedResult = result as ResultForFileUpload

  if (typedResult.events?.status === 'submitted') {
    return {
      success: false,
      error: 'Results have already been submitted. Contact your chapter VP for changes.',
    }
  }

  // Generate unique file path
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)
  const ext = file.name.split('.').pop()?.toLowerCase() || (fileType === 'gpx' ? 'gpx' : 'jpg')
  const filePath = `${typedResult.event_id}/${typedResult.rider_id}/${fileType}-${timestamp}-${randomId}.${ext}`

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
    return handleSupabaseError(
      uploadError,
      { operation: 'uploadResultFile.storage' },
      'Failed to upload file'
    )
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)
  const publicUrl = urlData.publicUrl

  // Update the result with the file path
  const updateField: ResultUpdate =
    fileType === 'gpx'
      ? { gpx_file_path: filePath }
      : fileType === 'control_card_front'
        ? { control_card_front_path: filePath }
        : { control_card_back_path: filePath }

  const { error: updateError } = await supabase
    .from('results')
    .update(updateField)
    .eq('submission_token', token)

  if (updateError) {
    // Try to clean up the uploaded file
    await supabase.storage.from(BUCKET_NAME).remove([filePath])
    return handleSupabaseError(
      updateError,
      { operation: 'uploadResultFile.database' },
      'Failed to save file reference'
    )
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
  const pathField =
    fileType === 'gpx'
      ? 'gpx_file_path'
      : fileType === 'control_card_front'
        ? 'control_card_front_path'
        : 'control_card_back_path'

  const { data: result, error: fetchError } = await supabase
    .from('results')
    .select(`id, ${pathField}, events(status)`)
    .eq('submission_token', token)
    .single()

  if (fetchError || !result) {
    return { success: false, error: 'Result not found or invalid token' }
  }

  const typedResult = result as ResultForFileUpload

  if (typedResult.events?.status === 'submitted') {
    return {
      success: false,
      error: 'Results have already been submitted. Contact your chapter VP for changes.',
    }
  }

  const filePath = typedResult[pathField as keyof ResultForFileUpload] as string | null
  if (!filePath) {
    return { success: true } // No file to delete
  }

  // Delete from storage
  const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove([filePath])

  if (deleteError) {
    logError(deleteError, { operation: 'deleteResultFile.storage', context: { filePath } })
    // Continue anyway to clear the reference
  }

  // Clear the file path in the database
  const updateData: ResultUpdate = { [pathField]: null } as ResultUpdate
  const { error: updateError } = await supabase
    .from('results')
    .update(updateData)
    .eq('submission_token', token)

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'deleteResultFile.database' },
      'Failed to clear file reference'
    )
  }

  return createActionResult()
}

// ============================================================================
// UPCOMING EVENTS
// ============================================================================

export interface UpcomingEvent {
  id: string
  slug: string
  name: string
  date: string
  distance: number
  startTime: string
  startLocation: string
}

/**
 * Get a rider's upcoming registered events. No authentication required.
 * Uses the rider ID to find events they're registered for that haven't happened yet.
 *
 * @param riderId - The rider's UUID
 * @returns Array of upcoming events they're registered for
 */
export async function getRiderUpcomingEvents(
  riderId: string
): Promise<ActionResult<UpcomingEvent[]>> {
  if (!riderId) {
    return { success: false, error: 'Invalid rider ID' }
  }

  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  // Get registrations for future events
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select(
      `
      events (
        id,
        slug,
        name,
        event_date,
        distance_km,
        start_time,
        start_location,
        status
      )
    `
    )
    .eq('rider_id', riderId)
    .eq('status', 'registered')

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'getRiderUpcomingEvents' },
      'Failed to fetch upcoming events'
    )
  }

  // Filter to only future scheduled events and transform
  const upcomingEvents: UpcomingEvent[] = []
  for (const reg of registrations || []) {
    const event = reg.events as {
      id: string
      slug: string
      name: string
      event_date: string
      distance_km: number
      start_time: string | null
      start_location: string | null
      status: string
    } | null

    if (event && event.status === 'scheduled' && event.event_date >= today) {
      upcomingEvents.push({
        id: event.id,
        slug: event.slug,
        name: event.name,
        date: event.event_date,
        distance: event.distance_km,
        startTime: event.start_time || '08:00',
        startLocation: event.start_location || '',
      })
    }
  }

  // Sort by date ascending
  upcomingEvents.sort((a, b) => a.date.localeCompare(b.date))

  return { success: true, data: upcomingEvents }
}

/**
 * Get upcoming events for a chapter that the rider is NOT registered for.
 * Used to suggest events to riders who have no upcoming registrations.
 *
 * @param chapterSlug - The chapter's database slug (e.g., 'toronto', 'simcoe')
 * @param riderId - The rider's UUID (to exclude events they're already registered for)
 * @param limit - Maximum number of events to return (default 3)
 * @returns Array of upcoming events in the chapter
 */
export async function getChapterUpcomingEvents(
  chapterSlug: string,
  riderId: string,
  limit: number = 3
): Promise<ActionResult<UpcomingEvent[]>> {
  if (!chapterSlug) {
    return { success: false, error: 'Invalid chapter' }
  }

  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  // First, get the events the rider is already registered for
  const { data: existingRegistrations } = await supabase
    .from('registrations')
    .select('event_id')
    .eq('rider_id', riderId)
    .eq('status', 'registered')

  const registeredEventIds = new Set((existingRegistrations || []).map((r) => r.event_id))

  // Get upcoming scheduled events for this chapter
  const { data: events, error } = await supabase
    .from('events')
    .select(
      `
      id,
      slug,
      name,
      event_date,
      distance_km,
      start_time,
      start_location,
      chapters!inner (slug)
    `
    )
    .eq('chapters.slug', chapterSlug)
    .eq('status', 'scheduled')
    .neq('event_type', 'permanent')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('distance_km', { ascending: false })
    .limit(limit + registeredEventIds.size) // Get extra to account for filtering

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'getChapterUpcomingEvents' },
      'Failed to fetch chapter events'
    )
  }

  // Filter out events the rider is already registered for and transform
  const upcomingEvents: UpcomingEvent[] = []
  for (const event of events || []) {
    if (registeredEventIds.has(event.id)) continue
    if (upcomingEvents.length >= limit) break

    upcomingEvents.push({
      id: event.id,
      slug: event.slug,
      name: event.name,
      date: event.event_date,
      distance: event.distance_km,
      startTime: event.start_time || '08:00',
      startLocation: event.start_location || '',
    })
  }

  return { success: true, data: upcomingEvents }
}
