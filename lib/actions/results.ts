'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleSupabaseError, createActionResult } from '@/lib/errors'
import { revalidateResultsTags } from '@/lib/revalidate-results'
import type { ActionResult } from '@/types/actions'
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
import type {
  RegistrationInsert,
  ResultInsert,
  ResultUpdate,
  ResultWithEventId,
} from '@/types/queries'

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
  distanceKm?: number
}

export async function createResult(data: CreateResultData): Promise<ActionResult> {
  const admin = await requireAdmin()

  const { eventId, riderId, finishTime, status, teamName, note, season, distanceKm } = data

  // Check if result already exists for this rider/event
  const { data: existing } = await getSupabaseAdmin()
    .from('results')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existing) {
    return { success: false, error: 'A result already exists for this rider in this event' }
  }

  const insertData: ResultInsert = {
    event_id: eventId,
    rider_id: riderId,
    finish_time: finishTime || null,
    status,
    team_name: teamName || null,
    note: note || null,
    season,
    distance_km: distanceKm,
  }

  const { error } = await getSupabaseAdmin().from('results').insert(insertData)

  if (error) {
    return handleSupabaseError(error, { operation: 'createResult' }, 'Failed to create result')
  }

  revalidatePath(`/admin/events/${eventId}`)

  // Revalidate public results pages
  await revalidateResultsTags(eventId)

  // Look up names for audit log
  const [{ data: eventData }, { data: riderData }] = await Promise.all([
    getSupabaseAdmin().from('events').select('name').eq('id', eventId).single(),
    getSupabaseAdmin().from('riders').select('first_name, last_name').eq('id', riderId).single(),
  ])
  const eventName = (eventData as { name: string } | null)?.name || eventId
  const riderName = riderData
    ? `${(riderData as { first_name: string; last_name: string }).first_name} ${(riderData as { first_name: string; last_name: string }).last_name}`
    : riderId

  await logAuditEvent({
    adminId: admin.id,
    action: 'create',
    entityType: 'result',
    entityId: eventId,
    description: `Created result for ${eventName}: ${riderName}, status ${status}`,
  })

  return createActionResult()
}

export interface AddRegistrationData {
  eventId: string
  riderId: string
}

export async function addRegistration(data: AddRegistrationData): Promise<ActionResult> {
  const admin = await requireAdmin()

  const { eventId, riderId } = data

  // Check if registration already exists for this rider/event
  const { data: existing } = await getSupabaseAdmin()
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existing) {
    return { success: false, error: 'This rider is already registered for this event' }
  }

  const insertData: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
  }

  const { error } = await getSupabaseAdmin().from('registrations').insert(insertData)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'addRegistration' },
      'Failed to add registration'
    )
  }

  revalidatePath(`/admin/events/${eventId}`)

  // Look up names for the audit log (the slug also drives cache invalidation)
  const [{ data: eventData }, { data: riderData }] = await Promise.all([
    getSupabaseAdmin().from('events').select('name, slug').eq('id', eventId).single(),
    getSupabaseAdmin().from('riders').select('first_name, last_name').eq('id', riderId).single(),
  ])
  const typedEventData = eventData as { name: string; slug: string } | null
  const eventName = typedEventData?.name || eventId

  // The public event page (/register/[slug]) is cached and invalidated by tag,
  // so an admin-added registration has to bust the same tags the rider-facing
  // registration flow does (lib/actions/register.ts) — otherwise the new rider
  // is missing from the "Registered" list until the ISR window expires.
  revalidateTag('registrations', { expire: 0 })
  revalidateTag('events', { expire: 0 }) // chapter calendar registration counts
  if (typedEventData?.slug) {
    revalidateTag(`event-${typedEventData.slug}`, { expire: 0 })
    revalidatePath(`/register/${typedEventData.slug}`)
  }
  const riderName = riderData
    ? `${(riderData as { first_name: string; last_name: string }).first_name} ${(riderData as { first_name: string; last_name: string }).last_name}`
    : riderId

  await logAuditEvent({
    adminId: admin.id,
    action: 'create',
    entityType: 'result',
    entityId: eventId,
    description: `Added registration for ${eventName}: ${riderName}`,
  })

  return createActionResult()
}

export async function updateResult(
  resultId: string,
  data: UpdateResultData
): Promise<ActionResult> {
  const admin = await requireAdmin()

  const updateData: ResultUpdate = {
    finish_time: data.finishTime,
    status: data.status,
    team_name: data.teamName,
    note: data.note,
    // An organizer editing a result makes it authoritative: clear the card
    // pre-fill marker so a later rider undo can never revert it.
    prefilled_at: null,
    ...(data.distanceKm !== undefined && { distance_km: data.distanceKm }),
  }

  const { error } = await getSupabaseAdmin().from('results').update(updateData).eq('id', resultId)

  if (error) {
    return handleSupabaseError(error, { operation: 'updateResult' }, 'Failed to update result')
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/events')

  // Get the event_id to revalidate results cache tags
  const { data: result } = await getSupabaseAdmin()
    .from('results')
    .select('event_id, events (name), riders (first_name, last_name)')
    .eq('id', resultId)
    .single()

  if (result) {
    const typedResult = result as ResultWithEventId
    if (typedResult.event_id) {
      await revalidateResultsTags(typedResult.event_id)
    }
  }

  const updateEvent = (result as { events: { name: string } | null } | null)?.events
  const updateRider = (
    result as { riders: { first_name: string; last_name: string } | null } | null
  )?.riders
  const updateDesc = [
    updateEvent ? updateEvent.name : null,
    updateRider ? `${updateRider.first_name} ${updateRider.last_name}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  await logAuditEvent({
    adminId: admin.id,
    action: 'update',
    entityType: 'result',
    entityId: resultId,
    description: `Updated result${updateDesc ? `: ${updateDesc}` : ''}`,
  })

  return createActionResult()
}

/**
 * Update team_name on a registration record (for fleche events).
 * Allows admins to correct team assignments before results are entered.
 */
export async function updateRegistrationTeamName(
  registrationId: string,
  teamName: string | null
): Promise<ActionResult> {
  await requireAdmin()

  const { error } = await getSupabaseAdmin()
    .from('registrations')
    .update({ team_name: teamName })
    .eq('id', registrationId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'updateRegistrationTeamName' },
      'Failed to update team name'
    )
  }

  revalidatePath('/admin/events')
  revalidateTag('registrations', { expire: 0 })

  return createActionResult()
}

export async function adminCancelRegistration(registrationId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  // Fetch registration with rider and event info for audit log
  const { data: registration, error: fetchError } = await getSupabaseAdmin()
    .from('registrations')
    .select('id, status, event_id, riders (first_name, last_name), events (name, slug)')
    .eq('id', registrationId)
    .single()

  if (fetchError || !registration) {
    return handleSupabaseError(
      fetchError,
      { operation: 'adminCancelRegistration' },
      'Registration not found'
    )
  }

  const reg = registration as {
    id: string
    status: string | null
    event_id: string
    riders: { first_name: string; last_name: string } | null
    events: { name: string; slug: string } | null
  }

  if (reg.status !== 'registered' && reg.status !== 'incomplete: membership') {
    return { success: false, error: 'This registration has already been cancelled' }
  }

  const { error: updateError } = await getSupabaseAdmin()
    .from('registrations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', registrationId)

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'adminCancelRegistration' },
      'Failed to cancel registration'
    )
  }

  revalidatePath('/admin/events')
  revalidateTag('registrations', { expire: 0 })
  revalidateTag('events', { expire: 0 })
  if (reg.events?.slug) {
    revalidateTag(`event-${reg.events.slug}`, { expire: 0 })
    revalidatePath(`/register/${reg.events.slug}`)
  }

  const riderName = reg.riders
    ? `${reg.riders.first_name} ${reg.riders.last_name}`
    : 'Unknown rider'
  const eventName = reg.events?.name || reg.event_id

  await logAuditEvent({
    adminId: admin.id,
    action: 'update',
    entityType: 'registration',
    entityId: registrationId,
    description: `Cancelled registration for ${eventName}: ${riderName}`,
  })

  return createActionResult()
}

export async function deleteResult(resultId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  // Fetch event_id and names before deleting for revalidation and audit log
  const { data: result } = await getSupabaseAdmin()
    .from('results')
    .select('event_id, events (name), riders (first_name, last_name)')
    .eq('id', resultId)
    .single()

  const { error } = await getSupabaseAdmin().from('results').delete().eq('id', resultId)

  if (error) {
    return handleSupabaseError(error, { operation: 'deleteResult' }, 'Failed to delete result')
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/events')

  // Revalidate cache tags for results pages
  if (result) {
    const typedResult = result as ResultWithEventId
    if (typedResult.event_id) {
      await revalidateResultsTags(typedResult.event_id)
    }
  }

  const deleteEvent = (result as { events: { name: string } | null } | null)?.events
  const deleteRider = (
    result as { riders: { first_name: string; last_name: string } | null } | null
  )?.riders
  const deleteDesc = [
    deleteEvent ? deleteEvent.name : null,
    deleteRider ? `${deleteRider.first_name} ${deleteRider.last_name}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  await logAuditEvent({
    adminId: admin.id,
    action: 'delete',
    entityType: 'result',
    entityId: resultId,
    description: `Deleted result${deleteDesc ? `: ${deleteDesc}` : ''}`,
  })

  return createActionResult()
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
  const admin = await requireAdmin()

  const insertData: ResultInsert[] = results.map((r) => ({
    event_id: eventId,
    rider_id: r.riderId,
    finish_time: r.finishTime || null,
    status: r.status,
    team_name: r.teamName || null,
    note: r.note || null,
    season,
    distance_km: distanceKm,
  }))

  const { error } = await getSupabaseAdmin().from('results').insert(insertData)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'createBulkResults' },
      'Failed to create results'
    )
  }

  revalidatePath(`/admin/events/${eventId}`)

  // Revalidate public results pages
  await revalidateResultsTags(eventId)

  const { data: bulkEventData } = await getSupabaseAdmin()
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single()
  const bulkEventName = (bulkEventData as { name: string } | null)?.name || eventId

  await logAuditEvent({
    adminId: admin.id,
    action: 'create',
    entityType: 'result',
    entityId: eventId,
    description: `Created ${results.length} bulk results for ${bulkEventName}`,
  })

  return { success: true }
}

export async function revalidateMembership(
  registrationId: string
): Promise<ActionResult<{ membershipFound: boolean; trialUsed?: boolean }>> {
  await requireAdmin()

  const supabase = getSupabaseAdmin()

  const { data: registration, error: fetchError } = await supabase
    .from('registrations')
    .select('id, status, rider_id, event_id, riders (first_name, last_name), events (chapter_id)')
    .eq('id', registrationId)
    .single()

  if (fetchError || !registration) {
    return handleSupabaseError(
      fetchError,
      { operation: 'revalidateMembership' },
      'Registration not found'
    )
  }

  const reg = registration as {
    id: string
    status: string | null
    rider_id: string
    event_id: string
    riders: { first_name: string; last_name: string } | null
    events: { chapter_id: string | null } | null
  }

  if (reg.status !== 'incomplete: membership') {
    return { success: false, error: 'Registration does not have missing membership status' }
  }

  if (!reg.riders) {
    return { success: false, error: 'Rider not found' }
  }

  let membership: Awaited<ReturnType<typeof getMembershipForRider>>
  try {
    membership = await getMembershipForRider(
      reg.rider_id,
      reg.riders.first_name,
      reg.riders.last_name,
      reg.events?.chapter_id ?? undefined
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CCN API error'
    return { success: false, error: message }
  }

  if (!membership.found) {
    return { success: true, data: { membershipFound: false } }
  }

  if (membership.type === 'Trial Member' && (await isTrialUsed(reg.rider_id))) {
    return { success: true, data: { membershipFound: true, trialUsed: true } }
  }

  const { error: updateError } = await supabase
    .from('registrations')
    .update({ status: 'registered' })
    .eq('id', registrationId)

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'revalidateMembership' },
      'Failed to update registration'
    )
  }

  revalidatePath(`/admin/events/${reg.event_id}`)
  revalidateTag('registrations', { expire: 0 })

  return { success: true, data: { membershipFound: true } }
}
