'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

interface NewsItemInput {
  title: string
  body: string
  is_published: boolean
  sort_order: number
}

function revalidateNews() {
  revalidateTag('news', 'max')
  revalidatePath('/')
  revalidatePath('/admin/news')
}

export async function createNewsItem(input: NewsItemInput): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin()

    const { data, error } = await getSupabaseAdmin()
      .from('news')
      .insert({
        title: input.title.trim(),
        body: input.body.trim(),
        is_published: input.is_published,
        sort_order: input.sort_order,
        created_by: admin.id,
      })
      .select('id')
      .single()

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'createNewsItem' },
        'Failed to create news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'news',
      entityId: data.id,
      description: `Created news item: ${input.title}`,
    })

    revalidateNews()
    return createActionResult({ id: data.id })
  } catch (error) {
    return handleActionError(error, { operation: 'createNewsItem' }, 'Failed to create news item')
  }
}

export async function updateNewsItem(id: string, input: NewsItemInput): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    const { error } = await getSupabaseAdmin()
      .from('news')
      .update({
        title: input.title.trim(),
        body: input.body.trim(),
        is_published: input.is_published,
        sort_order: input.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'updateNewsItem' },
        'Failed to update news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'news',
      entityId: id,
      description: `Updated news item: ${input.title}`,
    })

    revalidateNews()
    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'updateNewsItem' }, 'Failed to update news item')
  }
}

export async function deleteNewsItem(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    // Fetch title before deleting for audit log
    const { data: item } = await getSupabaseAdmin()
      .from('news')
      .select('title')
      .eq('id', id)
      .single()

    const { error } = await getSupabaseAdmin().from('news').delete().eq('id', id)

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'deleteNewsItem' },
        'Failed to delete news item'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'delete',
      entityType: 'news',
      entityId: id,
      description: `Deleted news item: ${item?.title ?? id}`,
    })

    revalidateNews()
    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'deleteNewsItem' }, 'Failed to delete news item')
  }
}
