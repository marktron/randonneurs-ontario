'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { createErwEvent, updateErwEvent } from '@/lib/erw/client'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export async function syncEventToErw(
  eventId: string
): Promise<ActionResult<{ canonicalUrl: string }>> {
  try {
    const admin = await requireAdmin()

    const { data: event, error } = await getSupabaseAdmin()
      .from('events')
      .select(
        'id, slug, name, description, distance_km, event_date, start_time, event_type, erw_event_id, route_id'
      )
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return { success: false, error: 'Event not found' }
    }

    if (event.event_type === 'permanent') {
      return { success: false, error: 'Permanent events cannot be synced to Epic Ride Weather' }
    }

    let rwgpsId: string | null = null
    if (event.route_id) {
      const { data: route } = await getSupabaseAdmin()
        .from('routes')
        .select('rwgps_id')
        .eq('id', event.route_id)
        .single()
      rwgpsId = route?.rwgps_id ?? null
    }

    const eventData = {
      name: event.name,
      description: event.description || '',
      distanceKm: event.distance_km,
      eventDate: event.event_date,
      startTime: event.start_time || null,
      slug: event.slug,
      rwgpsId,
    }

    let erwResult
    if (event.erw_event_id) {
      erwResult = await updateErwEvent(event.erw_event_id, eventData)
    } else {
      erwResult = await createErwEvent(eventData)
    }

    if (!erwResult.success || !erwResult.data) {
      return { success: false, error: erwResult.error || 'Failed to sync to Epic Ride Weather' }
    }

    await getSupabaseAdmin()
      .from('events')
      .update({
        erw_event_id: erwResult.data.erwEventId,
        erw_canonical_url: erwResult.data.canonicalUrl,
      })
      .eq('id', eventId)

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: eventId,
      description: `Synced event to Epic Ride Weather: ${event.name}`,
    })

    return { success: true, data: { canonicalUrl: erwResult.data.canonicalUrl } }
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'syncEventToErw' },
      'Failed to sync to Epic Ride Weather'
    )
  }
}

interface BulkSyncResult {
  synced: number
  failed: number
  errors: string[]
}

export async function syncAllEventsToErw(): Promise<ActionResult<BulkSyncResult>> {
  try {
    const admin = await requireAdmin()

    const { data: events, error } = await getSupabaseAdmin()
      .from('events')
      .select(
        'id, slug, name, description, distance_km, event_date, start_time, event_type, route_id'
      )
      .eq('status', 'scheduled')
      .is('erw_event_id', null)
      .neq('event_type', 'permanent')
      .order('event_date', { ascending: true })

    if (error) {
      return { success: false, error: 'Failed to fetch events' }
    }

    if (!events || events.length === 0) {
      return { success: true, data: { synced: 0, failed: 0, errors: [] } }
    }

    let synced = 0
    let failed = 0
    const errors: string[] = []

    for (const event of events) {
      let rwgpsId: string | null = null
      if (event.route_id) {
        const { data: route } = await getSupabaseAdmin()
          .from('routes')
          .select('rwgps_id')
          .eq('id', event.route_id)
          .single()
        rwgpsId = route?.rwgps_id ?? null
      }

      const erwResult = await createErwEvent({
        name: event.name,
        description: event.description || '',
        distanceKm: event.distance_km,
        eventDate: event.event_date,
        startTime: event.start_time || null,
        slug: event.slug,
        rwgpsId,
      })

      if (erwResult.success && erwResult.data) {
        await getSupabaseAdmin()
          .from('events')
          .update({
            erw_event_id: erwResult.data.erwEventId,
            erw_canonical_url: erwResult.data.canonicalUrl,
          })
          .eq('id', event.id)
        synced++
      } else {
        failed++
        errors.push(`${event.name}: ${erwResult.error}`)
      }
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      description: `Bulk synced ${synced} events to Epic Ride Weather (${failed} failed)`,
    })

    return { success: true, data: { synced, failed, errors } }
  } catch (error) {
    return handleActionError(error, { operation: 'syncAllEventsToErw' }, 'Bulk sync failed')
  }
}
