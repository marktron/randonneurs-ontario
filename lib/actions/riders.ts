'use server'

import { revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { applyRiderSearchFilter } from '@/lib/utils/rider-search'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, handleDataError } from '@/lib/errors'
import { createSlug } from '@/lib/utils'
import { emailIlikePattern } from '@/lib/utils/validation'
import type { ActionResult } from '@/types/actions'
import type {
  RiderInsert,
  RiderUpdate,
  RiderIdOnly,
  RegistrationUpdate,
  ResultUpdate,
  RegistrationWithRiderId,
  ResultWithRiderId,
} from '@/types/queries'

export interface RiderSearchResult {
  id: string
  first_name: string
  last_name: string
  email: string | null
}

export async function searchRiders(query: string): Promise<RiderSearchResult[]> {
  await requireAdmin()

  if (!query || query.length < 2) {
    return []
  }

  let dbQuery = getSupabaseAdmin().from('riders').select('id, first_name, last_name, email')

  dbQuery = applyRiderSearchFilter(dbQuery, query)

  const { data, error } = await dbQuery.order('last_name', { ascending: true }).limit(20)

  if (error) {
    return handleDataError(error, { operation: 'searchRiders', context: { query } }, [])
  }

  return data as RiderSearchResult[]
}

export interface CreateRiderData {
  firstName: string
  lastName: string
  email?: string | null
}

export interface CreateRiderResult extends ActionResult {
  riderId?: string
}

export async function createRider(data: CreateRiderData): Promise<CreateRiderResult> {
  const admin = await requireAdmin()

  const { firstName, lastName, email } = data
  const normalizedEmail = email?.trim().toLowerCase() || null

  if (!firstName || !lastName) {
    return { success: false, error: 'First name and last name are required' }
  }

  // Check if rider with same email already exists (case-insensitive — legacy
  // rows may have mixed-case emails)
  if (normalizedEmail) {
    const { data: existing } = await getSupabaseAdmin()
      .from('riders')
      .select('id')
      .ilike('email', emailIlikePattern(normalizedEmail))
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'A rider with this email already exists' }
    }
  }

  const baseSlug = createSlug(`${firstName} ${lastName}`)

  // Try base slug first, then append -2, -3, etc. on unique constraint violation
  let slug = baseSlug
  let newRider: { id: string } | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      slug = `${baseSlug}-${attempt + 1}`
    }

    const insertData: RiderInsert = {
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      slug,
    }

    const { data, error } = await getSupabaseAdmin()
      .from('riders')
      .insert(insertData)
      .select('id')
      .single()

    if (!error) {
      newRider = data as { id: string } | null
      break
    }

    // 23505 = unique_violation — retry with next suffix
    if (error.code === '23505' && error.message?.includes('riders_slug_key')) {
      lastError = error
      continue
    }

    // Any other error — fail immediately
    return handleSupabaseError(error, { operation: 'createRider' }, 'Failed to create rider')
  }

  if (!newRider && lastError) {
    return handleSupabaseError(
      lastError as { code: string; message: string; details: string },
      { operation: 'createRider' },
      'Failed to create rider'
    )
  }

  if (!newRider) {
    return handleActionError(
      new Error('Rider creation returned no data'),
      { operation: 'createRider' },
      'Failed to create rider'
    )
  }

  const typedNewRider = newRider as RiderIdOnly

  await logAuditEvent({
    adminId: admin.id,
    action: 'create',
    entityType: 'rider',
    entityId: typedNewRider.id,
    description: `Created rider: ${firstName} ${lastName}`,
  })

  return { success: true, riderId: typedNewRider.id }
}

export interface UpdateRiderData {
  firstName: string
  lastName: string
  email?: string | null
}

export async function updateRider(riderId: string, data: UpdateRiderData): Promise<ActionResult> {
  const admin = await requireAdmin()

  const { firstName, lastName, email } = data
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const normalizedEmail = email?.trim().toLowerCase() || null

  if (!trimmedFirst || !trimmedLast) {
    return { success: false, error: 'First name and last name are required' }
  }

  // If email is being set, check it's not already used by another rider
  // (case-insensitive — legacy rows may have mixed-case emails)
  if (normalizedEmail) {
    const { data: existing } = await getSupabaseAdmin()
      .from('riders')
      .select('id')
      .ilike('email', emailIlikePattern(normalizedEmail))
      .neq('id', riderId)
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'Another rider already has this email address' }
    }
  }

  const updateData: RiderUpdate = {
    first_name: trimmedFirst,
    last_name: trimmedLast,
    email: normalizedEmail,
  }

  const { error } = await getSupabaseAdmin().from('riders').update(updateData).eq('id', riderId)

  if (error) {
    return handleSupabaseError(error, { operation: 'updateRider' }, 'Failed to update rider')
  }

  await logAuditEvent({
    adminId: admin.id,
    action: 'update',
    entityType: 'rider',
    entityId: riderId,
    description: `Updated rider: ${trimmedFirst} ${trimmedLast}`,
  })

  revalidateTag('riders', { expire: 0 })
  revalidateTag('results', { expire: 0 })

  return { success: true }
}

export interface RiderData {
  firstName: string
  lastName: string
  email?: string | null
  gender?: string | null
}

export interface MergeRidersData {
  targetRiderId: string // Rider to keep
  sourceRiderIds: string[] // All riders being merged (including target)
  riderData: RiderData // Updated rider properties
}

export interface MergeRidersResult extends ActionResult {
  updatedRegistrationsCount?: number
  updatedResultsCount?: number
  deletedRidersCount?: number
}

export async function mergeRiders(data: MergeRidersData): Promise<MergeRidersResult> {
  const admin = await requireAdmin()

  const { targetRiderId, sourceRiderIds, riderData } = data

  // Validate we have at least 2 riders to merge
  if (sourceRiderIds.length < 2) {
    return { success: false, error: 'At least 2 riders are required to merge' }
  }

  // Validate target is in the source list
  if (!sourceRiderIds.includes(targetRiderId)) {
    return { success: false, error: 'Target rider must be one of the selected riders' }
  }

  // Riders to delete (all except target)
  const ridersToDelete = sourceRiderIds.filter((id) => id !== targetRiderId)

  try {
    // Step 1: Move registrations to target rider, deleting duplicates first
    const { data: targetRegs } = await getSupabaseAdmin()
      .from('registrations')
      .select('event_id')
      .eq('rider_id', targetRiderId)

    const targetEventIds = new Set((targetRegs ?? []).map((r) => r.event_id))

    const { data: sourceRegs } = await getSupabaseAdmin()
      .from('registrations')
      .select('id, event_id')
      .in('rider_id', ridersToDelete)

    const duplicateRegIds = (sourceRegs ?? [])
      .filter((r) => targetEventIds.has(r.event_id))
      .map((r) => r.id)
    const moveRegIds = (sourceRegs ?? [])
      .filter((r) => !targetEventIds.has(r.event_id))
      .map((r) => r.id)

    if (duplicateRegIds.length > 0) {
      const { error: deleteRegsError } = await getSupabaseAdmin()
        .from('registrations')
        .delete()
        .in('id', duplicateRegIds)

      if (deleteRegsError) {
        console.error('Error deleting duplicate registrations:', deleteRegsError)
        return { success: false, error: 'Failed to update registrations' }
      }
    }

    let updatedRegistrations: { id: string }[] = []
    if (moveRegIds.length > 0) {
      const regUpdateData: RegistrationUpdate = { rider_id: targetRiderId }
      const { data: movedRegs, error: updateRegsError } = await getSupabaseAdmin()
        .from('registrations')
        .update(regUpdateData)
        .in('id', moveRegIds)
        .select('id')

      if (updateRegsError) {
        console.error('Error updating registrations:', updateRegsError)
        return { success: false, error: 'Failed to update registrations' }
      }
      updatedRegistrations = movedRegs ?? []
    }

    // Step 2: Move results to target rider, deleting duplicates first
    const { data: targetResults } = await getSupabaseAdmin()
      .from('results')
      .select('event_id')
      .eq('rider_id', targetRiderId)

    const targetResultEventIds = new Set((targetResults ?? []).map((r) => r.event_id))

    const { data: sourceResults } = await getSupabaseAdmin()
      .from('results')
      .select('id, event_id')
      .in('rider_id', ridersToDelete)

    const duplicateResultIds = (sourceResults ?? [])
      .filter((r) => targetResultEventIds.has(r.event_id))
      .map((r) => r.id)
    const moveResultIds = (sourceResults ?? [])
      .filter((r) => !targetResultEventIds.has(r.event_id))
      .map((r) => r.id)

    if (duplicateResultIds.length > 0) {
      const { error: deleteResultsError } = await getSupabaseAdmin()
        .from('results')
        .delete()
        .in('id', duplicateResultIds)

      if (deleteResultsError) {
        console.error('Error deleting duplicate results:', deleteResultsError)
        return { success: false, error: 'Failed to update results' }
      }
    }

    let updatedResults: { id: string }[] = []
    if (moveResultIds.length > 0) {
      const resultUpdateData: ResultUpdate = { rider_id: targetRiderId }
      const { data: movedResults, error: updateResultsError } = await getSupabaseAdmin()
        .from('results')
        .update(resultUpdateData)
        .in('id', moveResultIds)
        .select('id')

      if (updateResultsError) {
        console.error('Error updating results:', updateResultsError)
        return { success: false, error: 'Failed to update results' }
      }
      updatedResults = movedResults ?? []
    }

    // Step 3: Move rider_memberships to target rider (skip if season already exists on target)
    const { data: targetMemberships } = await getSupabaseAdmin()
      .from('rider_memberships')
      .select('season')
      .eq('rider_id', targetRiderId)

    const targetSeasons = new Set((targetMemberships ?? []).map((m) => m.season))

    const { data: sourceMemberships } = await getSupabaseAdmin()
      .from('rider_memberships')
      .select('id, season')
      .in('rider_id', ridersToDelete)

    if (sourceMemberships) {
      const toMove = sourceMemberships.filter((m) => !targetSeasons.has(m.season))
      if (toMove.length > 0) {
        await getSupabaseAdmin()
          .from('rider_memberships')
          .update({ rider_id: targetRiderId })
          .in(
            'id',
            toMove.map((m) => m.id)
          )
      }
    }

    // Step 4: Delete the other riders (cascades remaining rider_memberships with duplicate seasons)
    const { error: deleteError } = await getSupabaseAdmin()
      .from('riders')
      .delete()
      .in('id', ridersToDelete)

    if (deleteError) {
      console.error('Error deleting old riders:', deleteError)
      return { success: false, error: 'Failed to delete old riders' }
    }

    // Step 5: Update the target rider with new properties
    const parsedGender =
      riderData.gender === 'M' || riderData.gender === 'F' || riderData.gender === 'X'
        ? riderData.gender
        : null

    const riderUpdateData: RiderUpdate = {
      first_name: riderData.firstName.trim(),
      last_name: riderData.lastName.trim(),
      email: riderData.email?.trim().toLowerCase() || null,
      gender: parsedGender,
    }

    const { error: updateRiderError } = await getSupabaseAdmin()
      .from('riders')
      .update(riderUpdateData)
      .eq('id', targetRiderId)

    if (updateRiderError) {
      console.error('Error updating target rider:', updateRiderError)
      return { success: false, error: 'Failed to update merged rider' }
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'merge',
      entityType: 'rider',
      entityId: targetRiderId,
      description: `Merged ${sourceRiderIds.length} riders into: ${riderData.firstName} ${riderData.lastName}`,
    })

    revalidateTag('riders', { expire: 0 })
    revalidateTag('results', { expire: 0 })
    revalidateTag('registrations', { expire: 0 })

    return {
      success: true,
      updatedRegistrationsCount: updatedRegistrations?.length || 0,
      updatedResultsCount: updatedResults?.length || 0,
      deletedRidersCount: ridersToDelete.length,
    }
  } catch (err) {
    console.error('Error merging riders:', err)
    return { success: false, error: 'An unexpected error occurred while merging riders' }
  }
}

export async function getRiderCounts(
  riderIds: string[]
): Promise<Record<string, { registrations: number; results: number }>> {
  await requireAdmin()

  // Get registration counts
  const { data: regs } = await getSupabaseAdmin()
    .from('registrations')
    .select('rider_id')
    .in('rider_id', riderIds)

  // Get result counts
  const { data: results } = await getSupabaseAdmin()
    .from('results')
    .select('rider_id')
    .in('rider_id', riderIds)

  // Count per rider
  const counts: Record<string, { registrations: number; results: number }> = {}

  for (const id of riderIds) {
    counts[id] = { registrations: 0, results: 0 }
  }

  const typedRegs = (regs as RegistrationWithRiderId[]) || []
  for (const reg of typedRegs) {
    if (reg.rider_id && counts[reg.rider_id]) {
      counts[reg.rider_id].registrations++
    }
  }

  const typedResults = (results as ResultWithRiderId[]) || []
  for (const result of typedResults) {
    if (result.rider_id && counts[result.rider_id]) {
      counts[result.rider_id].results++
    }
  }

  return counts
}
