'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import type { ActionResult } from '@/types/actions'

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
  const { data: existing } = await supabaseAdmin
    .from('results')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existing) {
    return { success: false, error: 'A result already exists for this rider in this event' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('results') as any).insert({
    event_id: eventId,
    rider_id: riderId,
    finish_time: finishTime || null,
    status,
    team_name: teamName || null,
    note: note || null,
    season,
    distance_km: distanceKm,
  })

  if (error) {
    console.error('Error creating result:', error)
    return { success: false, error: 'Failed to create result' }
  }

  revalidatePath(`/admin/events/${eventId}`)
  return { success: true }
}

export async function updateResult(resultId: string, data: UpdateResultData): Promise<ActionResult> {
  await requireAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('results') as any)
    .update({
      finish_time: data.finishTime,
      status: data.status,
      team_name: data.teamName,
      note: data.note,
    })
    .eq('id', resultId)

  if (error) {
    console.error('Error updating result:', error)
    return { success: false, error: 'Failed to update result' }
  }

  revalidatePath('/admin/events')
  return { success: true }
}

export async function deleteResult(resultId: string): Promise<ActionResult> {
  await requireAdmin()

  const { error } = await supabaseAdmin
    .from('results')
    .delete()
    .eq('id', resultId)

  if (error) {
    console.error('Error deleting result:', error)
    return { success: false, error: 'Failed to delete result' }
  }

  revalidatePath('/admin/events')
  return { success: true }
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

  const insertData = results.map((r) => ({
    event_id: eventId,
    rider_id: r.riderId,
    finish_time: r.finishTime || null,
    status: r.status,
    team_name: r.teamName || null,
    note: r.note || null,
    season,
    distance_km: distanceKm,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('results') as any).insert(insertData)

  if (error) {
    console.error('Error creating bulk results:', error)
    return { success: false, error: 'Failed to create results' }
  }

  revalidatePath(`/admin/events/${eventId}`)
  return { success: true }
}
