/**
 * Database Fetcher for Supabase.
 *
 * Queries events and results from the database for comparison
 * with HTML source data.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { DbEvent, DbResult } from './types'

let supabaseClient: SupabaseClient | null = null

/**
 * Get or create the Supabase client.
 * Uses environment variables for configuration.
 */
function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  // Service role key is required to bypass RLS and query all data
  // Fall back to anon key if service role key is not available (limited functionality)
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL environment variable is not set')
  }
  if (!supabaseKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set.\n' +
        'The service role key is recommended for full access to data.'
    )
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}

/**
 * Format PostgreSQL interval to HH:MM string.
 * Handles various interval formats from Supabase.
 */
function formatIntervalToTime(interval: string | null): string | null {
  if (!interval) return null

  // Handle "HH:MM:SS" format
  const hmsMatch = interval.match(/^(\d+):(\d{2}):(\d{2})$/)
  if (hmsMatch) {
    return `${parseInt(hmsMatch[1])}:${hmsMatch[2]}`
  }

  // Handle "X hours Y minutes" format
  const wordsMatch = interval.match(/(\d+)\s*hours?\s*(\d+)?\s*minutes?/i)
  if (wordsMatch) {
    const hours = parseInt(wordsMatch[1])
    const minutes = wordsMatch[2] ? parseInt(wordsMatch[2]) : 0
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  // Handle "X:YY" format (already in target format)
  const shortMatch = interval.match(/^(\d+):(\d{2})$/)
  if (shortMatch) {
    return interval
  }

  return null
}

/**
 * Get the chapter ID from the slug.
 */
async function getChapterId(chapterSlug: string): Promise<string | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('chapters')
    .select('id')
    .eq('slug', chapterSlug)
    .single()

  if (error || !data) {
    return null
  }

  return data.id
}

/**
 * Fetch events and results for a chapter and year.
 */
export async function getDbEventsForChapterYear(
  chapterSlug: string,
  year: number
): Promise<DbEvent[]> {
  const supabase = getSupabaseClient()

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  // Handle permanent events differently (they have event_type = 'permanent')
  if (chapterSlug === 'permanent') {
    const { data: events, error } = await supabase
      .from('events')
      .select(
        `
        id,
        name,
        event_date,
        distance_km,
        results (
          id,
          finish_time,
          status,
          rider:riders (
            id,
            first_name,
            last_name
          )
        )
      `
      )
      .eq('event_type', 'permanent')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date')

    if (error) {
      throw new Error(`Failed to fetch permanent events: ${error.message}`)
    }

    return formatDbEvents(events || [])
  }

  // For regular chapters, first get the chapter ID
  const chapterId = await getChapterId(chapterSlug)
  if (!chapterId) {
    throw new Error(`Chapter not found: ${chapterSlug}`)
  }

  const { data: events, error } = await supabase
    .from('events')
    .select(
      `
      id,
      name,
      event_date,
      distance_km,
      results (
        id,
        finish_time,
        status,
        rider:riders (
          id,
          first_name,
          last_name
        )
      )
    `
    )
    .eq('chapter_id', chapterId)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date')

  if (error) {
    throw new Error(`Failed to fetch events: ${error.message}`)
  }

  return formatDbEvents(events || [])
}

/**
 * Format raw Supabase response into DbEvent structure.
 */
function formatDbEvents(events: unknown[]): DbEvent[] {
  return events.map((event: unknown) => {
    const e = event as {
      id: string
      name: string
      event_date: string
      distance_km: number
      results?: Array<{
        id: string
        finish_time: string | null
        status: string
        rider?: {
          id: string
          first_name: string
          last_name: string
        }
      }>
    }

    const results: DbResult[] = (e.results || [])
      .filter((r) => r.rider) // Only include results with valid rider data
      .map((r) => ({
        riderId: r.rider!.id,
        riderFirstName: r.rider!.first_name || '',
        riderLastName: r.rider!.last_name || '',
        time: formatIntervalToTime(r.finish_time),
        status: r.status,
      }))

    return {
      id: e.id,
      date: e.event_date,
      name: e.name,
      distance: e.distance_km,
      results,
    }
  })
}

/**
 * Get all available years for a chapter.
 */
export async function getAvailableYears(chapterSlug: string): Promise<number[]> {
  const supabase = getSupabaseClient()

  if (chapterSlug === 'permanent') {
    const { data, error } = await supabase
      .from('events')
      .select('event_date')
      .eq('event_type', 'permanent')
      .order('event_date')

    if (error) throw new Error(`Failed to fetch years: ${error.message}`)

    const years = new Set<number>()
    for (const event of data || []) {
      years.add(new Date(event.event_date).getFullYear())
    }
    return Array.from(years).sort((a, b) => b - a)
  }

  const chapterId = await getChapterId(chapterSlug)
  if (!chapterId) return []

  const { data, error } = await supabase
    .from('events')
    .select('event_date')
    .eq('chapter_id', chapterId)
    .order('event_date')

  if (error) throw new Error(`Failed to fetch years: ${error.message}`)

  const years = new Set<number>()
  for (const event of data || []) {
    years.add(new Date(event.event_date).getFullYear())
  }
  return Array.from(years).sort((a, b) => b - a)
}
