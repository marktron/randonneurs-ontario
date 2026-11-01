'use server'

/**
 * Ride organizer contact for the digital brevet card (see
 * docs/digital-brevet-card.md, "Ride organizer"). Persisted on the event. The
 * default is the chapter VP from lib/chapter-vps.ts, with the phone taken from
 * that VP's admins row, falling back to the chapter's earliest chapter_admin.
 * Saving writes a changed non-empty phone back to the matching admins row.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import { CHAPTER_VPS } from '@/lib/chapter-vps'
import type { ActionResult } from '@/types/actions'

export interface OrganizerContact {
  name: string
  phone: string
  email: string
}

/**
 * The chapter's default organizer, used only to seed the admin form when an
 * event has no stored organizer yet. Name/email come from the chapter VP in
 * CHAPTER_VPS; phone comes from the admins row with that email (case-insensitive).
 * Chapters with no VP entry fall back to the earliest chapter_admin. Returns
 * empty strings (never throws on query errors) when nothing is found.
 */
export async function getChapterOrganizerDefaults(chapterId: string): Promise<OrganizerContact> {
  await requireAdmin()
  const empty = { name: '', phone: '', email: '' }
  if (!chapterId) return empty

  const supabase = getSupabaseAdmin()

  const { data: chapter } = await supabase
    .from('chapters')
    .select('slug')
    .eq('id', chapterId)
    .maybeSingle()
  const slug = (chapter as { slug: string | null } | null)?.slug
  const vp = slug ? CHAPTER_VPS[slug] : undefined

  if (vp) {
    const { data } = await supabase.from('admins').select('phone').ilike('email', vp.email).limit(1)
    const row = data?.[0] as { phone: string | null } | undefined
    return { name: vp.name, phone: row?.phone ?? '', email: vp.email }
  }

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

/**
 * Write a changed, non-empty organizer phone back to the admins row matching
 * the organizer email (case-insensitive). Never clears a phone. Failures are
 * logged and swallowed so they cannot fail the save.
 */
async function syncAdminPhone(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizer: OrganizerContact
): Promise<void> {
  try {
    const email = organizer.email.trim()
    const phone = organizer.phone.trim()
    if (!email || !phone) return

    const { data, error } = await supabase
      .from('admins')
      .select('id, phone')
      .ilike('email', email)
      .limit(1)
    if (error) throw error
    const row = data?.[0] as { id: string; phone: string | null } | undefined
    if (!row || (row.phone ?? '') === phone) return

    const { error: updateError } = await supabase.from('admins').update({ phone }).eq('id', row.id)
    if (updateError) throw updateError
  } catch (error) {
    logError(error, { operation: 'saveEventOrganizer.syncAdminPhone' })
  }
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

    await syncAdminPhone(supabase, organizer)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'saveEventOrganizer' }, 'Failed to save organizer')
  }
}
