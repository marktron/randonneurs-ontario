'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'

export interface RouteData {
  name: string
  slug: string
  chapterId?: string | null
  distanceKm?: number | null
  collection?: string | null
  description?: string | null
  rwgpsUrl?: string | null // Accept full URL, will extract ID
  cueSheetUrl?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface ActionResult {
  success: boolean
  error?: string
}

/**
 * Extract RWGPS route ID from various URL formats:
 * - https://ridewithgps.com/routes/12345678
 * - https://ridewithgps.com/routes/12345678?privacy_code=xyz
 * - https://ridewithgps.com/ambassador_routes/12345678
 * - Just the ID: 12345678
 */
function extractRwgpsId(input: string | null | undefined): string | null {
  if (!input) return null

  const trimmed = input.trim()
  if (!trimmed) return null

  // If it's already just a number, return it
  if (/^\d+$/.test(trimmed)) {
    return trimmed
  }

  // Try to extract from URL patterns
  const patterns = [
    /ridewithgps\.com\/routes\/(\d+)/,
    /ridewithgps\.com\/ambassador_routes\/(\d+)/,
    /ridewithgps\.com\/trips\/(\d+)/,
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) {
      return match[1]
    }
  }

  // If nothing matched but looks like it might be an ID, return as-is
  // This allows for flexibility
  return trimmed
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

export async function createRoute(data: RouteData): Promise<ActionResult> {
  await requireAdmin()

  const { name, chapterId, distanceKm, collection, description, rwgpsUrl, cueSheetUrl, notes, isActive } = data

  if (!name?.trim()) {
    return { success: false, error: 'Route name is required' }
  }

  const slug = data.slug || createSlug(name)
  const rwgpsId = extractRwgpsId(rwgpsUrl)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('routes') as any).insert({
    name: name.trim(),
    slug,
    chapter_id: chapterId || null,
    distance_km: distanceKm || null,
    collection: collection || null,
    description: description || null,
    rwgps_id: rwgpsId,
    cue_sheet_url: cueSheetUrl || null,
    notes: notes || null,
    is_active: isActive ?? true,
  })

  if (error) {
    console.error('Error creating route:', error)
    if (error.code === '23505') {
      return { success: false, error: 'A route with this slug already exists' }
    }
    return { success: false, error: 'Failed to create route' }
  }

  revalidatePath('/admin/routes')
  return { success: true }
}

export async function updateRoute(routeId: string, data: Partial<RouteData>): Promise<ActionResult> {
  await requireAdmin()

  const updateData: Record<string, unknown> = {}

  if (data.name !== undefined) {
    updateData.name = data.name.trim()
  }
  if (data.slug !== undefined) {
    updateData.slug = data.slug
  }
  if (data.chapterId !== undefined) {
    updateData.chapter_id = data.chapterId || null
  }
  if (data.distanceKm !== undefined) {
    updateData.distance_km = data.distanceKm || null
  }
  if (data.collection !== undefined) {
    updateData.collection = data.collection || null
  }
  if (data.description !== undefined) {
    updateData.description = data.description || null
  }
  if (data.rwgpsUrl !== undefined) {
    updateData.rwgps_id = extractRwgpsId(data.rwgpsUrl)
  }
  if (data.cueSheetUrl !== undefined) {
    updateData.cue_sheet_url = data.cueSheetUrl || null
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes || null
  }
  if (data.isActive !== undefined) {
    updateData.is_active = data.isActive
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('routes') as any)
    .update(updateData)
    .eq('id', routeId)

  if (error) {
    console.error('Error updating route:', error)
    if (error.code === '23505') {
      return { success: false, error: 'A route with this slug already exists' }
    }
    return { success: false, error: 'Failed to update route' }
  }

  revalidatePath('/admin/routes')
  revalidatePath(`/admin/routes/${routeId}`)
  return { success: true }
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  await requireAdmin()

  // Check if route is used by any events
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('route_id', routeId)
    .limit(1)

  if (events && events.length > 0) {
    return {
      success: false,
      error: 'Cannot delete route that is used by events. Mark it as inactive instead.'
    }
  }

  const { error } = await supabaseAdmin
    .from('routes')
    .delete()
    .eq('id', routeId)

  if (error) {
    console.error('Error deleting route:', error)
    return { success: false, error: 'Failed to delete route' }
  }

  revalidatePath('/admin/routes')
  return { success: true }
}

export async function toggleRouteActive(routeId: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('routes') as any)
    .update({ is_active: isActive })
    .eq('id', routeId)

  if (error) {
    console.error('Error toggling route active status:', error)
    return { success: false, error: 'Failed to update route status' }
  }

  revalidatePath('/admin/routes')
  return { success: true }
}
