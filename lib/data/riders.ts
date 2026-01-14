/**
 * Riders Data Fetching Module
 *
 * This module contains READ operations for the rider directory.
 * Uses the public_riders view which respects RLS and hides sensitive data.
 */
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { handleDataError } from '@/lib/errors'
import type { PublicRider } from '@/types/queries'

export interface RiderListItem {
  slug: string
  firstName: string
  lastName: string
}

const getAllRidersInner = cache(async (): Promise<RiderListItem[]> => {
  const BATCH_SIZE = 1000
  let allData: Array<Pick<PublicRider, 'slug' | 'first_name' | 'last_name'>> = []
  let from = 0

  while (true) {
    const { data, error } = await getSupabase()
      .from('public_riders')
      .select('slug, first_name, last_name')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .range(from, from + BATCH_SIZE - 1)

    if (error) {
      return handleDataError(error, { operation: 'getAllRiders' }, [])
    }

    if (!data || data.length === 0) break

    allData = allData.concat(data)

    if (data.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return allData.map((rider) => ({
    slug: rider.slug ?? '',
    firstName: rider.first_name ?? '',
    lastName: rider.last_name ?? '',
  }))
})

export async function getAllRiders(): Promise<RiderListItem[]> {
  return unstable_cache(async () => getAllRidersInner(), ['all-riders'], {
    tags: ['riders'],
    revalidate: 3600, // Cache for 1 hour
  })()
}
