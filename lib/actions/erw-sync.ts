'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { createErwEvent, updateErwEvent } from '@/lib/erw/client'
import { isErwSyncEnabled } from '@/lib/erw/config'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export async function syncEventToErw(
  eventId: string
): Promise<ActionResult<{ canonicalUrl: string }>> {
  try {
    const admin = await requireAdmin()

    if (!isErwSyncEnabled()) {
      return {
        success: false,
        error: 'Epic Ride Weather sync is only available in production',
      }
    }

    const { data: event, error } = await getSupabaseAdmin()
      .from('events')
      .select(
        'id, slug, name, description, distance_km, event_date, start_time, event_type, status, erw_event_id, route_id'
      )
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return { success: false, error: 'Event not found' }
    }

    if (event.event_type === 'permanent') {
      return { success: false, error: 'Permanent events cannot be synced to Epic Ride Weather' }
    }

    // Drafts are hidden from the public site; pushing one to ERW would publish
    // it there. Publishing the event syncs it automatically.
    if (event.status === 'draft') {
      return { success: false, error: 'Publish the event before syncing to Epic Ride Weather' }
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
      actorLabel: admin.name,
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
