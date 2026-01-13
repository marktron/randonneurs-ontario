'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { getUrlSlugFromDbSlug } from '@/lib/chapter-config'
import { handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type {
  ResultInsert,
  ResultUpdate,
  ResultWithEventId,
  EventForResultsRevalidation,
} from '@/types/queries'

// Helper to revalidate cache tags for results pages
async function revalidateResultsTags(eventId: string) {
  // Get event info including season and chapter
  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select('season, chapters (slug)')
    .eq('id', eventId)
    .single()

  if (event) {
    const typedEvent = event as EventForResultsRevalidation
    // Revalidate general results cache
    revalidateTag('results')
    
    if (typedEvent.season && typedEvent.chapters?.slug) {
      const urlSlug = getUrlSlugFromDbSlug(typedEvent.chapters.slug)
      if (urlSlug) {
        // Revalidate chapter-specific results cache
        revalidateTag(`chapter-${urlSlug}`)
        // Revalidate year-specific results cache
        revalidateTag(`year-${typedEvent.season}`)
        // Also revalidate the path for immediate UI update
        revalidatePath(`/results/${typedEvent.season}/${urlSlug}`)
      }
    }
  }
}

export type ResultStatus = 'pending' | 'finished' | 'dnf' | 'dns' | 'otl' | 'dq'

export interface CreateResultData {
  eventId: string
  riderId: string
  finishTime?: string | null
  status: ResultStatus
  teamName?: string | null
  note?: string | null
  season: number
  distanceKm: number
}

export interface UpdateResultData {
  finishTime?: string | null
  status?: ResultStatus
  teamName?: string | null
  note?: string | null
}

export async function createResult(data: CreateResultData): Promise<ActionResult> {
  await requireAdmin()

  const { eventId, riderId, finishTime, status, teamName, note, season, distanceKm } = data

  // Check if result already exists for this rider/event
  const { data: existing } = await getSupabaseAdmin()
    .from('results')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existing) {
    return { success: false, error: 'A result already exists for this rider in this event' }
  }

  const insertData: ResultInsert = {
    event_id: eventId,
    rider_id: riderId,
    finish_time: finishTime || null,
    status,
    team_name: teamName || null,
    note: note || null,
    season,
    distance_km: distanceKm,
  }

  const { error } = await getSupabaseAdmin()
    .from('results')
    .insert(insertData)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'createResult' },
      'Failed to create result'
    )
  }

  revalidatePath(`/admin/events/${eventId}`)

  // Revalidate public results pages
  await revalidateResultsPages(eventId)

  return createActionResult()
}

export async function updateResult(resultId: string, data: UpdateResultData): Promise<ActionResult> {
  await requireAdmin()

  const updateData: ResultUpdate = {
    finish_time: data.finishTime,
    status: data.status,
    team_name: data.teamName,
    note: data.note,
  }

  const { error } = await getSupabaseAdmin()
    .from('results')
    .update(updateData)
    .eq('id', resultId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'updateResult' },
      'Failed to update result'
    )
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/events')

  // Get the event_id to revalidate results cache tags
  const { data: result } = await getSupabaseAdmin()
    .from('results')
    .select('event_id')
    .eq('id', resultId)
    .single()

  if (result) {
    const typedResult = result as ResultWithEventId
    if (typedResult.event_id) {
      await revalidateResultsTags(typedResult.event_id)
    }
  }

  return createActionResult()
}

export async function deleteResult(resultId: string): Promise<ActionResult> {
  await requireAdmin()

  // Fetch event_id before deleting for revalidation
  const { data: result } = await getSupabaseAdmin()
    .from('results')
    .select('event_id')
    .eq('id', resultId)
    .single()

  const { error } = await getSupabaseAdmin()
    .from('results')
    .delete()
    .eq('id', resultId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'deleteResult' },
      'Failed to delete result'
    )
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/events')

  // Revalidate cache tags for results pages
  if (result) {
    const typedResult = result as ResultWithEventId
    if (typedResult.event_id) {
      await revalidateResultsTags(typedResult.event_id)
    }
  }

  return createActionResult()
}

export async function createBulkResults(
  eventId: string,
  results: Array<{
    riderId: string
    finishTime?: string | null
    status: ResultStatus
    teamName?: string | null
    note?: string | null
  }>,
  season: number,
  distanceKm: number
): Promise<ActionResult> {
  await requireAdmin()

  const insertData: ResultInsert[] = results.map((r) => ({
    event_id: eventId,
    rider_id: r.riderId,
    finish_time: r.finishTime || null,
    status: r.status,
    team_name: r.teamName || null,
    note: r.note || null,
    season,
    distance_km: distanceKm,
  }))

  const { error } = await getSupabaseAdmin()
    .from('results')
    .insert(insertData)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'createBulkResults' },
      'Failed to create results'
    )
  }

  revalidatePath(`/admin/events/${eventId}`)

  // Revalidate public results pages
  await revalidateResultsPages(eventId)

  return { success: true }
}
