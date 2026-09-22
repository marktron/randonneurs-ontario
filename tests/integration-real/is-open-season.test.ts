import { describe, it, expect } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'

const supabase = getTestSupabase()

// is_open_season(season, today) is the one definition of which seasons the
// award reconcilers may write to. It takes the reference date as a parameter
// so the rollover rule can be pinned down without moving the clock.
async function isOpen(season: number, today: string): Promise<boolean> {
  const data = await checked(
    supabase.rpc('is_open_season', { p_season: season, p_today: today }),
    `is_open_season(${season}, ${today})`
  )
  return data as unknown as boolean
}

describe('is_open_season', () => {
  it('the current calendar year is open all year', async () => {
    expect(await isOpen(2026, '2026-01-01')).toBe(true)
    expect(await isOpen(2026, '2026-06-15')).toBe(true)
    expect(await isOpen(2026, '2026-12-31')).toBe(true)
  })

  it('the previous year stays open through January 31', async () => {
    expect(await isOpen(2025, '2026-01-01')).toBe(true)
    expect(await isOpen(2025, '2026-01-31')).toBe(true)
  })

  it('the previous year closes on February 1', async () => {
    expect(await isOpen(2025, '2026-02-01')).toBe(false)
    expect(await isOpen(2025, '2026-12-31')).toBe(false)
  })

  it('two years back is never open, even in January', async () => {
    expect(await isOpen(2024, '2026-01-15')).toBe(false)
  })

  it('a future season is never open', async () => {
    expect(await isOpen(2027, '2026-12-31')).toBe(false)
  })

  it('defaults to today when no date is given', async () => {
    const thisYear = new Date().getFullYear()
    const data = await checked(
      supabase.rpc('is_open_season', { p_season: thisYear }),
      'is_open_season(default today)'
    )
    expect(data as unknown as boolean).toBe(true)
  })
})
