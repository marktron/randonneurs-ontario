/**
 * Find or create the event row for a permanent ride.
 *
 * One ride exists per route, date and direction (the slug). The first
 * registrant sets its start time and start point; later registrants must
 * match them. Plain module (no `'use server'`), like its siblings here.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { permanentStartMismatch, type StoredRideStart } from '@/lib/permanent-start'
import type { EventInsert } from '@/types/queries'

export type PermanentEventRow = StoredRideStart & { id: string }

const SELECT = 'id, start_time, start_location, start_offset_km, direction'
const UNIQUE_VIOLATION = '23505'

type Result = { ok: true; event: PermanentEventRow } | { ok: false; error: string; cause?: unknown }

async function findBySlug(slug: string): Promise<PermanentEventRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('events')
    .select(SELECT)
    .eq('slug', slug)
    .maybeSingle()
  return (data as PermanentEventRow | null) ?? null
}

function join(
  event: PermanentEventRow,
  requested: { startTime: string; offsetKm: number | null }
): Result {
  const mismatch = permanentStartMismatch(event, requested)
  return mismatch ? { ok: false, error: mismatch } : { ok: true, event }
}

export async function createOrJoinPermanentEvent(
  insertEvent: EventInsert,
  requested: { startTime: string; offsetKm: number | null }
): Promise<Result> {
  const existing = await findBySlug(insertEvent.slug)
  if (existing) return join(existing, requested)

  const { data: created, error } = await getSupabaseAdmin()
    .from('events')
    .insert(insertEvent)
    .select(SELECT)
    .single()

  if (created) return { ok: true, event: created as PermanentEventRow }

  // Another rider created the same ride between our lookup and insert.
  if (error?.code === UNIQUE_VIOLATION) {
    const winner = await findBySlug(insertEvent.slug)
    if (winner) return join(winner, requested)
  }
  return { ok: false, error: 'Failed to create permanent ride event', cause: error }
}
