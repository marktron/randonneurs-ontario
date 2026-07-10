'use server'

/**
 * Ride organizer contact for the digital brevet card (see
 * docs/digital-brevet-card.md, "Ride organizer"). Persisted on the event; the
 * admin seeds it from the chapter's chapter_admin the first time.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export interface OrganizerContact {
  name: string
  phone: string
  email: string
}

/**
 * The chapter's default organizer = its earliest chapter_admin. Used only to
 * seed the admin form when an event has no stored organizer yet. Returns empty
 * strings (never throws) when the chapter has no chapter_admin.
 */
export async function getChapterOrganizerDefaults(chapterId: string): Promise<OrganizerContact> {
  const empty = { name: '', phone: '', email: '' }
  if (!chapterId) return empty

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('admins')
    .select('name, phone, email')
    .eq('chapter_id', chapterId)
    .eq('role', 'chapter_admin')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error || !data || data.length === 0) return empty
  const row = data[0] as { name: string | null; phone: string | null; email: string | null }
  return { name: row.name ?? '', phone: row.phone ?? '', email: row.email ?? '' }
}

/** Persist the organizer contact on the event. Empty fields become null. */
export async function saveEventOrganizer(
  eventId: string,
  organizer: OrganizerContact
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = getSupabaseAdmin()

    const payload = {
      organizer_name: organizer.name.trim() || null,
      organizer_phone: organizer.phone.trim() || null,
      organizer_email: organizer.email.trim() || null,
    }

    const { error } = await supabase.from('events').update(payload).eq('id', eventId)
    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'saveEventOrganizer', context: { eventId } },
        'Failed to save organizer'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: eventId,
      description: 'Updated digital brevet card ride organizer',
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'saveEventOrganizer' }, 'Failed to save organizer')
  }
}
