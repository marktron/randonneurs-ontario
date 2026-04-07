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
// Images are browser-compressed before upload and typically arrive at ~2 MB;
// 10 MB is a generous backstop. GPX files are plain XML that can grow large
// for long brevets (a 600 km ride at 1 Hz recording is ~30-40 MB), so we allow
// up to 100 MB. The Supabase bucket's own file_size_limit matches (see
// supabase/migrations/*_raise_rider_submissions_size_limit.sql).
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_GPX_SIZE = 100 * 1024 * 1024 // 100 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_GPX_TYPES = ['application/gpx+xml', 'application/xml', 'text/xml']

export interface ResultSubmissionData {
  eventId: string
  eventName: string
  eventDate: string
  eventDistance: number
  eventType: string
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
        event_type,
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
      event_type: string
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
      eventType: event.event_type,
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

export interface CreateResultUploadUrlInput {
  token: string
  fileType: 'gpx' | 'control_card_front' | 'control_card_back'
  fileName: string
  contentType: string
  fileSize: number
}

export interface CreateResultUploadUrlData {
  signedUrl: string
  uploadToken: string
  path: string
  publicUrl: string
}

/**
 * Generate a one-time signed upload URL for a result file. The browser uploads
 * the file directly to Supabase Storage using this URL, bypassing Next.js
 * Server Action body limits and Vercel's request body limits.
 *
 * After the upload finishes, the client must call confirmResultUpload to
 * persist the file path against the result.
 *
 * No authentication required — token-scoped.
 */
export async function createResultUploadUrl(
  input: CreateResultUploadUrlInput
): Promise<ActionResult<CreateResultUploadUrlData>> {
  const { token, fileType, fileName, contentType, fileSize } = input

  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  // Validate size before issuing a signed URL. GPX files can get large for
  // long brevets, so they have a higher ceiling than images.
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return { success: false, error: 'Invalid file size' }
  }
  const maxSize = fileType === 'gpx' ? MAX_GPX_SIZE : MAX_IMAGE_SIZE
  if (fileSize > maxSize) {
    return {
      success: false,
      error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`,
    }
  }

  // Validate content type. The client is responsible for sending a valid
  // contentType — for GPX uploads it always normalizes to application/gpx+xml
  // before calling this action, since browsers (especially Safari) don't
  // always recognize the GPX MIME type from a .gpx file extension.
  const allowedTypes = fileType === 'gpx' ? ALLOWED_GPX_TYPES : ALLOWED_IMAGE_TYPES
  if (!allowedTypes.includes(contentType)) {
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

  // Generate unique file path scoped to this event/rider
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)
  const safeExt = sanitizeExtension(fileName, fileType)
  const filePath = `${typedResult.event_id}/${typedResult.rider_id}/${fileType}-${timestamp}-${randomId}.${safeExt}`

  // Mint a one-time signed upload URL via the service-role client
  const { data: signedData, error: signError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filePath)

  if (signError || !signedData) {
    return handleSupabaseError(
      signError,
      { operation: 'createResultUploadUrl.sign' },
      'Failed to create upload URL'
    )
  }

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

  return {
    success: true,
    data: {
      signedUrl: signedData.signedUrl,
      uploadToken: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
    },
  }
}

export interface ConfirmResultUploadInput {
  token: string
  fileType: 'gpx' | 'control_card_front' | 'control_card_back'
  path: string
}

/**
 * Persist a file path against a result after the browser has finished uploading
 * to Supabase Storage via the signed URL from createResultUploadUrl.
 * Removes any previously stored file of the same type.
 *
 * No authentication required — token-scoped.
 */
export async function confirmResultUpload(
  input: ConfirmResultUploadInput
): Promise<ActionResult<{ path: string; url: string }>> {
  const { token, fileType, path } = input

  if (!token) {
    return { success: false, error: 'Invalid submission token' }
  }

  if (!path) {
    return { success: false, error: 'Missing file path' }
  }

  const supabase = getSupabaseAdmin()

  // Verify token and get the existing file paths so we can clean up
  const { data: result, error: fetchError } = await supabase
    .from('results')
    .select(
      'id, event_id, rider_id, gpx_file_path, control_card_front_path, control_card_back_path, events(status)'
    )
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

  // Verify the path belongs to this event/rider — prevents a valid token from
  // being used to claim files uploaded under a different scope.
  const expectedPrefix = `${typedResult.event_id}/${typedResult.rider_id}/${fileType}-`
  if (!path.startsWith(expectedPrefix)) {
    return { success: false, error: 'Invalid file path for this submission' }
  }

  // Remove any previously stored file of this type to avoid orphans
  const previousPath =
    fileType === 'gpx'
      ? typedResult.gpx_file_path
      : fileType === 'control_card_front'
        ? typedResult.control_card_front_path
        : typedResult.control_card_back_path

  if (previousPath && previousPath !== path) {
    const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove([previousPath])
    if (removeError) {
      logError(removeError, {
        operation: 'confirmResultUpload.removePrevious',
        context: { previousPath },
      })
      // Continue — orphan cleanup is not fatal
    }
  }

  // Persist the new path
  const updateField: ResultUpdate =
    fileType === 'gpx'
      ? { gpx_file_path: path }
      : fileType === 'control_card_front'
        ? { control_card_front_path: path }
        : { control_card_back_path: path }

  const { error: updateError } = await supabase
    .from('results')
    .update(updateField)
    .eq('submission_token', token)

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'confirmResultUpload.database' },
      'Failed to save file reference'
    )
  }

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)

  return {
    success: true,
    data: { path, url: urlData.publicUrl },
  }
}

function sanitizeExtension(
  fileName: string,
  fileType: 'gpx' | 'control_card_front' | 'control_card_back'
): string {
  const raw = fileName.split('.').pop()?.toLowerCase() || ''
  const safe = raw.replace(/[^a-z0-9]/g, '')
  if (safe) return safe
  return fileType === 'gpx' ? 'gpx' : 'jpg'
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

/**
 * Get upcoming events from the same chapter as the given event.
 * Used after registration to show other events the rider might be interested in.
 * Excludes the current event.
 */
export async function getUpcomingEventsByEventId(
  eventId: string,
  limit: number = 3
): Promise<ActionResult<UpcomingEvent[]>> {
  if (!eventId) {
    return { success: false, error: 'Invalid event' }
  }

  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  // First, get the event to find its chapter and date
  const { data: currentEvent, error: eventError } = await supabase
    .from('events')
    .select('chapter_id, event_date')
    .eq('id', eventId)
    .single()

  if (eventError || !currentEvent) {
    return handleSupabaseError(
      eventError,
      { operation: 'getUpcomingEventsByEventId.eventLookup' },
      'Event not found'
    )
  }

  // Get upcoming scheduled events for this chapter after the current event's date
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
      start_location
    `
    )
    .eq('chapter_id', currentEvent.chapter_id)
    .eq('status', 'scheduled')
    .neq('event_type', 'permanent')
    .neq('id', eventId)
    .gt('event_date', currentEvent.event_date)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(limit)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'getUpcomingEventsByEventId' },
      'Failed to fetch upcoming events'
    )
  }

  const upcomingEvents: UpcomingEvent[] = (events || []).map((event) => ({
    id: event.id,
    slug: event.slug,
    name: event.name,
    date: event.event_date,
    distance: event.distance_km,
    startTime: event.start_time || '08:00',
    startLocation: event.start_location || '',
  }))

  return { success: true, data: upcomingEvents }
}
