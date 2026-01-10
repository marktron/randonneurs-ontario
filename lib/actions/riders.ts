'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { applyRiderSearchFilter } from '@/lib/utils/rider-search'
import type { ActionResult } from '@/types/actions'

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

  let dbQuery = getSupabaseAdmin()
    .from('riders')
    .select('id, first_name, last_name, email')

  dbQuery = applyRiderSearchFilter(dbQuery, query)

  const { data, error } = await dbQuery
    .order('last_name', { ascending: true })
    .limit(20)

  if (error) {
    console.error('Error searching riders:', error)
    return []
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
  await requireAdmin()

  const { firstName, lastName, email } = data

  if (!firstName || !lastName) {
    return { success: false, error: 'First name and last name are required' }
  }

  // Check if rider with same email already exists (if email provided)
  if (email) {
    const { data: existing } = await getSupabaseAdmin()
      .from('riders')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return { success: false, error: 'A rider with this email already exists' }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newRider, error } = await (getSupabaseAdmin().from('riders') as any)
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: email || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating rider:', error)
    return { success: false, error: 'Failed to create rider' }
  }

  return { success: true, riderId: newRider.id }
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
  await requireAdmin()

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
  const ridersToDelete = sourceRiderIds.filter(id => id !== targetRiderId)

  try {
    // Step 1: Update all registrations to use target rider
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedRegistrations, error: updateRegsError } = await (getSupabaseAdmin().from('registrations') as any)
      .update({ rider_id: targetRiderId })
      .in('rider_id', ridersToDelete)
      .select('id')

    if (updateRegsError) {
      console.error('Error updating registrations:', updateRegsError)
      return { success: false, error: 'Failed to update registrations' }
    }

    // Step 2: Update all results to use target rider
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedResults, error: updateResultsError } = await (getSupabaseAdmin().from('results') as any)
      .update({ rider_id: targetRiderId })
      .in('rider_id', ridersToDelete)
      .select('id')

    if (updateResultsError) {
      console.error('Error updating results:', updateResultsError)
      return { success: false, error: 'Failed to update results' }
    }

    // Step 3: Delete the other riders
    const { error: deleteError } = await getSupabaseAdmin()
      .from('riders')
      .delete()
      .in('id', ridersToDelete)

    if (deleteError) {
      console.error('Error deleting old riders:', deleteError)
      return { success: false, error: 'Failed to delete old riders' }
    }

    // Step 4: Update the target rider with new properties
    const parsedGender = riderData.gender === 'M' || riderData.gender === 'F' || riderData.gender === 'X'
      ? riderData.gender
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateRiderError } = await (getSupabaseAdmin().from('riders') as any)
      .update({
        first_name: riderData.firstName.trim(),
        last_name: riderData.lastName.trim(),
        email: riderData.email || null,
        gender: parsedGender,
      })
      .eq('id', targetRiderId)

    if (updateRiderError) {
      console.error('Error updating target rider:', updateRiderError)
      return { success: false, error: 'Failed to update merged rider' }
    }

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

export async function getRiderCounts(riderIds: string[]): Promise<Record<string, { registrations: number; results: number }>> {
  // Get registration counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regs } = await (getSupabaseAdmin().from('registrations') as any)
    .select('rider_id')
    .in('rider_id', riderIds)

  // Get result counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results } = await (getSupabaseAdmin().from('results') as any)
    .select('rider_id')
    .in('rider_id', riderIds)

  // Count per rider
  const counts: Record<string, { registrations: number; results: number }> = {}

  for (const id of riderIds) {
    counts[id] = { registrations: 0, results: 0 }
  }

  for (const reg of (regs as { rider_id: string }[]) || []) {
    if (counts[reg.rider_id]) {
      counts[reg.rider_id].registrations++
    }
  }

  for (const result of (results as { rider_id: string }[]) || []) {
    if (counts[result.rider_id]) {
      counts[result.rider_id].results++
    }
  }

  return counts
}
