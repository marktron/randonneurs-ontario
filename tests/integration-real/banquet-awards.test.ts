import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'

// Banquet awards are season-scoped awards whose winners may have no rider
// profile (committees, non-members). These tests exercise the nullable
// rider_id + recipient_name path and the get_award_recipients RPC via anon.

const admin = getTestSupabase()

function getAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('[integration-real] Missing SUPABASE anon env vars.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
const anon = getAnonClient()

const SEASON = 2099 // far-future season isolates fixtures from real data
const NAME = 'Inttest Committee'
const BANQUET_SLUGS = [
  'mike-barry-jock-wadley',
  'beryl-burton',
  'coronation-cup',
  'jim-griffin-rookie-of-the-year',
  'organiser-of-the-year',
  'outstanding-performance',
  'dan-herbert',
  'half-wheel',
  'special-recognition',
]

let organiserAwardId: string

async function cleanup(): Promise<void> {
  await admin.from('rider_awards').delete().eq('recipient_name', NAME).eq('season', SEASON)
}

beforeAll(async () => {
  const award = await checked(
    admin.from('awards').select('id').eq('slug', 'organiser-of-the-year').single(),
    'load organiser award'
  )
  organiserAwardId = award!.id
  await cleanup()
})

afterAll(cleanup)

describe('banquet awards', () => {
  it('defines the nine banquet awards as season awards', async () => {
    const rows = await checked(
      admin.from('awards').select('slug, award_type').in('slug', BANQUET_SLUGS),
      'load banquet awards'
    )
    expect(rows!.map((r) => r.slug).sort()).toEqual([...BANQUET_SLUGS].sort())
    for (const r of rows!) expect(r.award_type).toBe('season')
  })

  it('rejects a rider_awards row with neither rider_id nor recipient_name', async () => {
    const { error } = await admin
      .from('rider_awards')
      .insert({ award_id: organiserAwardId, season: SEASON })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('rider_awards_recipient_check')
  })

  it('returns a name-only recipient with a null rider_slug', async () => {
    await checked(
      admin
        .from('rider_awards')
        .insert({ award_id: organiserAwardId, season: SEASON, recipient_name: NAME })
        .select('id')
        .single(),
      'insert name-only award'
    )
    const { data, error } = await anon.rpc('get_award_recipients', {
      p_award_slug: 'organiser-of-the-year',
    })
    expect(error).toBeNull()
    const row = (
      data as { rider_slug: string | null; rider_name: string; award_year: number }[]
    ).find((r) => r.award_year === SEASON)
    expect(row).toBeDefined()
    expect(row!.rider_name).toBe(NAME)
    expect(row!.rider_slug).toBeNull()
  })

  it('returns Mike Barry/Jock Wadley winners with non-empty names', async () => {
    const { data, error } = await anon.rpc('get_award_recipients', {
      p_award_slug: 'mike-barry-jock-wadley',
    })
    expect(error).toBeNull()
    const rows = data as { rider_name: string }[]
    expect(rows.length).toBeGreaterThanOrEqual(30)
    for (const r of rows) expect(r.rider_name.trim()).not.toBe('')
  })
})
