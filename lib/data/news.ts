import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { handleDataError } from '@/lib/errors'
import type { NewsItem } from '@/types/queries'

/**
 * Get published news items for homepage display.
 * Ordered by sort_order ascending (lower = higher), then created_at descending.
 */
export const getPublishedNews = cache(async (): Promise<NewsItem[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await getSupabase()
        .from('news')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        return handleDataError(error, { operation: 'getPublishedNews' }, [])
      }

      return data ?? []
    },
    ['published-news'],
    { revalidate: 60, tags: ['news'] }
  )()
})

/**
 * Get all news items for admin list.
 * Ordered by created_at descending (newest first).
 */
export async function getAllNews(): Promise<NewsItem[]> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-server')

  const { data, error } = await getSupabaseAdmin()
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return handleDataError(error, { operation: 'getAllNews' }, [])
  }

  return data ?? []
}

/**
 * Get a single news item by ID (for admin edit page).
 */
export async function getNewsItem(id: string): Promise<NewsItem | null> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-server')

  const { data, error } = await getSupabaseAdmin().from('news').select('*').eq('id', id).single()

  if (error) {
    return handleDataError(error, { operation: 'getNewsItem' }, null)
  }

  return data
}
