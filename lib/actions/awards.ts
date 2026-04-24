'use server'

import { revalidateTag } from 'next/cache'
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

const MIN_AWARD_SEASON = 1980

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

    const { data: awardRaw, error: awardError } = await getSupabaseAdmin()
      .from('awards')
      .select('id, title, award_type')
      .eq('id', data.awardId)
      .single()
    const award = awardRaw as AwardRow | null

    if (awardError && (awardError as { code?: string }).code !== 'PGRST116') {
      return handleSupabaseError(
        awardError,
        { operation: 'assignResultAward' },
        'Failed to load award'
      )
    }
    if (!award) {
      return { success: false, error: 'Award no longer exists. Reload the page.' }
    }
    if (award.award_type !== 'result') {
      return { success: false, error: 'This award is season-scoped — use the season form.' }
    }

    const { data: resultRaw, error: resultError } = await getSupabaseAdmin()
      .from('results')
      .select('id, rider_id, riders (first_name, last_name, slug), events (name, event_date)')
      .eq('id', data.resultId)
      .single()
    const result = resultRaw as ResultLookupRow | null

    if (resultError && (resultError as { code?: string }).code !== 'PGRST116') {
      return handleSupabaseError(
        resultError,
        { operation: 'assignResultAward' },
        'Failed to load result'
      )
    }
    if (!result) {
      return { success: false, error: 'Result not found.' }
    }

    const { error } = await getSupabaseAdmin()
      .from('result_awards')
      .insert({ result_id: data.resultId, award_id: data.awardId })

    if (error) {
      return handleSupabaseError(
        error,
        {
          operation: 'assignResultAward',
          userMessage: `This rider already has the ${award.title} for that result.`,
        },
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
    revalidateTag('records', { expire: 0 })
    if (result.riders?.slug) {
      revalidateTag(`rider-${result.riders.slug}`, { expire: 0 })
    }

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'assignResultAward' }, 'Failed to assign award')
  }
}

export interface AssignSeasonAwardData {
  awardId: string
  riderId: string
  season: number
  note?: string | null
}

interface RiderLookupRow {
  first_name: string
  last_name: string
  slug: string
}

export async function assignSeasonAward(data: AssignSeasonAwardData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!isFullAdmin(admin.role)) {
      return { success: false, error: 'Only full admins can assign awards' }
    }

    const maxSeason = new Date().getFullYear() + 1
    if (data.season < MIN_AWARD_SEASON || data.season > maxSeason) {
      return {
        success: false,
        error: `Season must be between ${MIN_AWARD_SEASON} and ${maxSeason}.`,
      }
    }

    const { data: awardRaw, error: awardError } = await getSupabaseAdmin()
      .from('awards')
      .select('id, title, award_type')
      .eq('id', data.awardId)
      .single()
    if (awardError && (awardError as { code?: string }).code !== 'PGRST116') {
      return handleSupabaseError(
        awardError,
        { operation: 'assignSeasonAward' },
        'Failed to load award'
      )
    }
    const award = awardRaw as AwardRow | null
    if (!award) {
      return { success: false, error: 'Award no longer exists. Reload the page.' }
    }
    if (award.award_type !== 'season') {
      return { success: false, error: 'This award is result-scoped — use the result form.' }
    }

    const { data: riderRaw, error: riderError } = await getSupabaseAdmin()
      .from('riders')
      .select('first_name, last_name, slug')
      .eq('id', data.riderId)
      .single()
    if (riderError && (riderError as { code?: string }).code !== 'PGRST116') {
      return handleSupabaseError(
        riderError,
        { operation: 'assignSeasonAward' },
        'Failed to load rider'
      )
    }
    const rider = riderRaw as RiderLookupRow | null
    if (!rider) {
      return { success: false, error: 'Rider not found.' }
    }

    const { error } = await getSupabaseAdmin()
      .from('rider_awards')
      .insert({
        rider_id: data.riderId,
        award_id: data.awardId,
        season: data.season,
        note: data.note ?? null,
      })

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'assignSeasonAward' },
        'Failed to assign award'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'award',
      entityId: data.awardId,
      description: `Assigned ${award.title} to ${rider.first_name} ${rider.last_name} for ${data.season} season`,
    })

    revalidateTag('awards', { expire: 0 })
    revalidateTag('records', { expire: 0 })
    revalidateTag(`rider-${rider.slug}`, { expire: 0 })

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'assignSeasonAward' }, 'Failed to assign award')
  }
}
