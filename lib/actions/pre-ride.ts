'use server'

/**
 * Admin action recording an approved pre-ride: a rider sanctioned to ride
 * the course ahead of the scheduled event with their own start date/time
 * (see docs/digital-brevet-card.md, "Pre-rides"). Setting the override IS
 * the approval — the conversation happens out-of-band. Deliberately no
 * policy validation on the chosen datetime; admins are trusted.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { isDigitalCardEventType } from '@/lib/brevet-card'
import { createActionResult, handleActionError, handleSupabaseError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type { RegistrationUpdate } from '@/types/queries'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * DATE_RE only checks shape (four digits, two digits, two digits) — it
 * accepts calendar nonsense like 2026-13-45. Confirm the value is a real
 * calendar date by round-tripping it through Date and comparing the parts
 * back out (Date normalizes overflow — e.g. Feb 31 → Mar 3 — instead of
 * rejecting it, so an equality check catches what the constructor won't).
 */
function isValidCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export async function setPreRideStart(input: {
  registrationId: string
  /** YYYY-MM-DD, or null to clear the pre-ride. */
  preRideDate: string | null
  /** HH:MM, or null to clear the pre-ride. */
  preRideStartTime: string | null
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    const clearing = input.preRideDate === null && input.preRideStartTime === null
    if (!clearing) {
      if (!input.preRideDate || !isValidCalendarDate(input.preRideDate)) {
        return { success: false, error: 'Pre-ride date must be YYYY-MM-DD' }
      }
      if (!input.preRideStartTime || !TIME_RE.test(input.preRideStartTime)) {
        return { success: false, error: 'Pre-ride start time must be HH:MM' }
      }
    }

    const supabase = getSupabaseAdmin()

    const { data: registration, error: fetchError } = await supabase
      .from('registrations')
      .select('id, status, events!inner (id, name, status, event_type)')
      .eq('id', input.registrationId)
      .single()

    if (fetchError || !registration) {
      return { success: false, error: 'Registration not found' }
    }

    const reg = registration as unknown as {
      id: string
      status: string | null
      events: { id: string; name: string; status: string | null; event_type: string | null }
    }

    if (reg.status !== 'registered') {
      return { success: false, error: 'Only active registrations can have a pre-ride' }
    }
    if (!isDigitalCardEventType(reg.events.event_type)) {
      return { success: false, error: 'This event type does not support a digital brevet card' }
    }
    if (reg.events.status !== 'scheduled') {
      return { success: false, error: 'Pre-rides can only be set while the event is scheduled' }
    }

    const updateData: RegistrationUpdate = {
      pre_ride_date: clearing ? null : input.preRideDate,
      pre_ride_start_time: clearing ? null : input.preRideStartTime,
    }
    const { error: updateError } = await supabase
      .from('registrations')
      .update(updateData)
      .eq('id', reg.id)

    if (updateError) {
      return handleSupabaseError(
        updateError,
        { operation: 'setPreRideStart', context: { registrationId: reg.id } },
        'Failed to save pre-ride start'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: reg.events.id,
      description: clearing
        ? `Cleared pre-ride start for registration ${reg.id} (${reg.events.name})`
        : `Set pre-ride start ${input.preRideDate} ${input.preRideStartTime} for registration ${reg.id} (${reg.events.name})`,
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'setPreRideStart' },
      'Failed to save pre-ride start'
    )
  }
}
