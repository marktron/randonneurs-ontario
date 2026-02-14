'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { createSlug } from '@/lib/utils'
import { getUrlSlugFromDbSlug } from '@/lib/chapter-config'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import type { ActionResult, MergeResult } from '@/types/actions'
import type {
  ChapterSlugOnly,
  Event,
  RouteInsert,
  RouteUpdate,
  RouteWithChapterId,
  EventUpdate,
} from '@/types/queries'

// Helper to revalidate cache tags for routes pages
async function revalidateRoutesTags(chapterId: string | null, routeSlug?: string) {
  // Revalidate general routes cache
  revalidateTag('routes', 'max')

  if (routeSlug) {
    // Revalidate specific route cache
    revalidateTag(`route-${routeSlug}`, 'max')
  }

  if (!chapterId) return

  // Get chapter slug
  const { data: chapter } = await getSupabaseAdmin()
    .from('chapters')
    .select('slug')
    .eq('id', chapterId)
    .single()

  if (chapter) {
    const typedChapter = chapter as ChapterSlugOnly
    if (typedChapter.slug) {
      const urlSlug = getUrlSlugFromDbSlug(typedChapter.slug)
      if (urlSlug) {
        // Revalidate chapter-specific routes cache
        revalidateTag(`chapter-${urlSlug}`, 'max')
        // Also revalidate the path for immediate UI update
        revalidatePath(`/routes/${urlSlug}`)
      }
    }
  }
}

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

export async function createRoute(data: RouteData): Promise<ActionResult> {
  const admin = await requireAdmin()

  const {
    name,
    chapterId,
    distanceKm,
    collection,
    description,
    rwgpsUrl,
    cueSheetUrl,
    notes,
    isActive,
  } = data

  if (!name?.trim()) {
    return { success: false, error: 'Route name is required' }
  }

  const slug = data.slug || createSlug(name)
  const rwgpsId = extractRwgpsId(rwgpsUrl)

  const insertData: RouteInsert = {
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
  }

  const { error } = await getSupabaseAdmin().from('routes').insert(insertData)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'createRoute', userMessage: 'A route with this slug already exists' },
      'Failed to create route'
    )
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/routes')

  // Revalidate cache tags for routes pages
  if (chapterId) {
    await revalidateRoutesTags(chapterId, slug)
  }

  await logAuditEvent({
    adminId: admin.id,
    action: 'create',
    entityType: 'route',
    description: `Created route: ${name}`,
  })

  return createActionResult()
}

export async function updateRoute(
  routeId: string,
  data: Partial<RouteData>
): Promise<ActionResult> {
  const admin = await requireAdmin()

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

  const typedUpdateData: RouteUpdate = updateData

  const { error } = await getSupabaseAdmin()
    .from('routes')
    .update(typedUpdateData)
    .eq('id', routeId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'updateRoute', userMessage: 'A route with this slug already exists' },
      'Failed to update route'
    )
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/routes')
  revalidatePath(`/admin/routes/${routeId}`)

  // Fetch route to get chapter, slug, and name for cache tag revalidation and audit log
  const { data: route } = await getSupabaseAdmin()
    .from('routes')
    .select('name, chapter_id, slug')
    .eq('id', routeId)
    .single()

  if (route) {
    const typedRoute = route as RouteWithChapterId & { slug: string }
    if (typedRoute.chapter_id) {
      await revalidateRoutesTags(typedRoute.chapter_id, typedRoute.slug)
    }
  }

  const updatedRouteName = data.name || (route as { name: string } | null)?.name || routeId

  await logAuditEvent({
    adminId: admin.id,
    action: 'update',
    entityType: 'route',
    entityId: routeId,
    description: `Updated route: ${updatedRouteName}`,
  })

  return { success: true }
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  // Fetch route to get chapter info and name before deleting
  const { data: route } = await getSupabaseAdmin()
    .from('routes')
    .select('name, chapter_id')
    .eq('id', routeId)
    .single()

  // Check if route is used by any events
  const { data: events } = await getSupabaseAdmin()
    .from('events')
    .select('id')
    .eq('route_id', routeId)
    .limit(1)

  if (events && events.length > 0) {
    return {
      success: false,
      error: 'Cannot delete route that is used by events. Mark it as inactive instead.',
    }
  }

  const { error } = await getSupabaseAdmin().from('routes').delete().eq('id', routeId)

  if (error) {
    return handleSupabaseError(error, { operation: 'deleteRoute' }, 'Failed to delete route')
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/routes')

  // Revalidate cache tags for routes pages
  if (route) {
    const typedRoute = route as RouteWithChapterId
    if (typedRoute.chapter_id) {
      await revalidateRoutesTags(typedRoute.chapter_id)
    }
  }

  await logAuditEvent({
    adminId: admin.id,
    action: 'delete',
    entityType: 'route',
    entityId: routeId,
    description: `Deleted route: ${(route as { name: string } | null)?.name || routeId}`,
  })

  return createActionResult()
}

export async function toggleRouteActive(routeId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()

  const updateData: RouteUpdate = { is_active: isActive }
  const { error } = await getSupabaseAdmin().from('routes').update(updateData).eq('id', routeId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'toggleRouteActive' },
      'Failed to update route status'
    )
  }

  // Revalidate admin pages (still use revalidatePath for admin routes)
  revalidatePath('/admin/routes')

  // Fetch route to get chapter, slug, and name for cache tag revalidation and audit log
  const { data: route } = await getSupabaseAdmin()
    .from('routes')
    .select('name, chapter_id, slug')
    .eq('id', routeId)
    .single()

  if (route) {
    const typedRoute = route as RouteWithChapterId & { slug: string }
    if (typedRoute.chapter_id) {
      await revalidateRoutesTags(typedRoute.chapter_id, typedRoute.slug)
    }
  }

  const routeName = (route as { name: string } | null)?.name || routeId

  await logAuditEvent({
    adminId: admin.id,
    action: 'update',
    entityType: 'route',
    entityId: routeId,
    description: `Set route ${isActive ? 'active' : 'inactive'}: ${routeName}`,
  })

  return createActionResult()
}

export interface MergeRoutesData {
  targetRouteId: string // Route to keep
  sourceRouteIds: string[] // All routes being merged (including target)
  routeData: RouteData // Updated route properties
}

export async function mergeRoutes(data: MergeRoutesData): Promise<MergeResult> {
  const admin = await requireAdmin()

  const { targetRouteId, sourceRouteIds, routeData } = data

  // Validate we have at least 2 routes to merge
  if (sourceRouteIds.length < 2) {
    return { success: false, error: 'At least 2 routes are required to merge' }
  }

  // Validate target is in the source list
  if (!sourceRouteIds.includes(targetRouteId)) {
    return { success: false, error: 'Target route must be one of the selected routes' }
  }

  // Routes to delete (all except target)
  const routesToDelete = sourceRouteIds.filter((id) => id !== targetRouteId)

  try {
    // Step 1: Update all events that reference any of the source routes to use target route
    const eventUpdateData: EventUpdate = { route_id: targetRouteId }
    const { data: updatedEvents, error: updateEventsError } = await getSupabaseAdmin()
      .from('events')
      .update(eventUpdateData)
      .in('route_id', routesToDelete)
      .select('id')

    if (updateEventsError) {
      return handleSupabaseError(
        updateEventsError,
        { operation: 'mergeRoutes.updateEvents' },
        'Failed to update events'
      )
    }

    const updatedEventsCount = updatedEvents?.length || 0

    // Step 2: Delete the other routes first (to free up slug if needed)
    const { error: deleteError } = await getSupabaseAdmin()
      .from('routes')
      .delete()
      .in('id', routesToDelete)

    if (deleteError) {
      return handleSupabaseError(
        deleteError,
        { operation: 'mergeRoutes.deleteRoutes' },
        'Failed to delete old routes'
      )
    }

    // Step 3: Update the target route with new properties
    const rwgpsId = extractRwgpsId(routeData.rwgpsUrl)

    const routeUpdateData: RouteUpdate = {
      name: routeData.name.trim(),
      slug: routeData.slug,
      chapter_id: routeData.chapterId || null,
      distance_km: routeData.distanceKm || null,
      collection: routeData.collection || null,
      description: routeData.description || null,
      rwgps_id: rwgpsId,
      cue_sheet_url: routeData.cueSheetUrl || null,
      notes: routeData.notes || null,
      is_active: routeData.isActive ?? true,
    }

    const { error: updateRouteError } = await getSupabaseAdmin()
      .from('routes')
      .update(routeUpdateData)
      .eq('id', targetRouteId)

    if (updateRouteError) {
      return handleSupabaseError(
        updateRouteError,
        {
          operation: 'mergeRoutes.updateRoute',
          userMessage: 'A route with this slug already exists',
        },
        'Failed to update merged route'
      )
    }

    revalidatePath('/admin/routes')
    revalidatePath('/admin/events')

    await logAuditEvent({
      adminId: admin.id,
      action: 'merge',
      entityType: 'route',
      entityId: targetRouteId,
      description: `Merged ${sourceRouteIds.length} routes into: ${routeData.name}`,
    })

    return {
      success: true,
      updatedEventsCount,
      deletedRoutesCount: routesToDelete.length,
    }
  } catch (err) {
    return handleActionError(
      err,
      { operation: 'mergeRoutes' },
      'An unexpected error occurred while merging routes'
    )
  }
}

export async function getRouteEventCounts(routeIds: string[]): Promise<Record<string, number>> {
  const { data, error } = await getSupabaseAdmin()
    .from('events')
    .select('route_id')
    .in('route_id', routeIds)

  if (error) {
    logError(error, { operation: 'getRouteEventCounts' })
    return {}
  }

  // Count events per route
  const counts: Record<string, number> = {}
  const typedData = (data as Pick<Event, 'route_id'>[]) || []
  for (const event of typedData) {
    if (event.route_id) {
      counts[event.route_id] = (counts[event.route_id] || 0) + 1
    }
  }

  return counts
}
