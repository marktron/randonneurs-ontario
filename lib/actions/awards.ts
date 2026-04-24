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
