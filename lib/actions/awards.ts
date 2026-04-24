'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { logAuditEvent } from '@/lib/audit-log'
import {
  handleActionError,
  handleSupabaseError,
  handleDataError,
  createActionResult,
} from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export interface RiderResultOption {
  resultId: string
  eventName: string
  eventDate: string
  distanceKm: number
  chapterName: string | null
  status: string
  finishTime: string | null
}

interface RiderResultRow {
  id: string
  status: string | null
  finish_time: string | null
  distance_km: number | null
  events: {
    name: string | null
    event_date: string | null
    chapters: { name: string | null } | null
  } | null
}

export async function searchRiderResults(riderId: string): Promise<RiderResultOption[]> {
  await requireAdmin()

  const { data, error } = await getSupabaseAdmin()
    .from('results')
    .select(
      `
        id,
        status,
        finish_time,
        distance_km,
        events (name, event_date, chapters (name))
      `
    )
    .eq('rider_id', riderId)
    .order('events(event_date)', { ascending: false })

  if (error) {
    return handleDataError(error, { operation: 'searchRiderResults', context: { riderId } }, [])
  }

  return ((data as RiderResultRow[] | null) ?? []).map((row) => ({
    resultId: row.id,
    eventName: row.events?.name ?? '',
    eventDate: row.events?.event_date ?? '',
    distanceKm: row.distance_km ?? 0,
    chapterName: row.events?.chapters?.name ?? null,
    status: row.status ?? 'pending',
    finishTime: row.finish_time,
  }))
}

export interface AssignResultAwardData {
  awardId: string
  resultId: string
}

interface AwardRow {
  id: string
  title: string
  award_type: 'result' | 'season'
}

interface ResultLookupRow {
  id: string
  rider_id: string
  riders: { first_name: string; last_name: string; slug: string } | null
  events: { name: string; event_date: string } | null
}

export async function assignResultAward(data: AssignResultAwardData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!isFullAdmin(admin.role)) {
      return { success: false, error: 'Only full admins can assign awards' }
    }

    const { data: awardRaw } = await getSupabaseAdmin()
      .from('awards')
      .select('id, title, award_type')
      .eq('id', data.awardId)
      .single()
    const award = awardRaw as AwardRow | null

    if (!award) {
      return { success: false, error: 'Award no longer exists. Reload the page.' }
    }
    if (award.award_type !== 'result') {
      return { success: false, error: 'This award is season-scoped — use the season form.' }
    }

    const { data: resultRaw } = await getSupabaseAdmin()
      .from('results')
      .select('id, rider_id, riders (first_name, last_name, slug), events (name, event_date)')
      .eq('id', data.resultId)
      .single()
    const result = resultRaw as ResultLookupRow | null

    if (!result) {
      return { success: false, error: 'Result not found.' }
    }

    const { error } = await getSupabaseAdmin()
      .from('result_awards')
      .insert({ result_id: data.resultId, award_id: data.awardId })
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return {
          success: false,
          error: `This rider already has the ${award.title} for that result.`,
        }
      }
      return handleSupabaseError(
        error,
        { operation: 'assignResultAward' },
        'Failed to assign award'
      )
    }

    const riderName = result.riders
      ? `${result.riders.first_name} ${result.riders.last_name}`
      : 'unknown rider'
    const eventLabel = result.events
      ? `${result.events.name} ${result.events.event_date}`
      : data.resultId

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'award',
      entityId: `${data.awardId}:${data.resultId}`,
      description: `Assigned ${award.title} to ${riderName} for ${eventLabel}`,
    })

    revalidateTag('awards', { expire: 0 })
    if (result.riders?.slug) {
      revalidateTag(`rider-${result.riders.slug}`, { expire: 0 })
    }

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'assignResultAward' }, 'Failed to assign award')
  }
}
