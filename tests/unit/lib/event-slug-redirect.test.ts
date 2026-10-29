import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockHandleDataError = vi.fn()

const mockUnstableCache = vi.fn((fn: unknown, ..._rest: unknown[]) => fn)
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, ...rest: unknown[]) => mockUnstableCache(fn, ...rest),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
  }),
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
  }),
}))

vi.mock('@/lib/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/errors')>()),
  handleDataError: (...args: unknown[]) => mockHandleDataError(...args),
}))

import { getEventSlugRedirect } from '@/lib/data/events'

describe('getEventSlugRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SHOW_DRAFT_EVENTS', undefined)
  })

  it('returns null quietly when no history row matches', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await getEventSlugRedirect('old-slug-a')).toBeNull()
    expect(mockHandleDataError).not.toHaveBeenCalled()
  })

  it('folds the draft-preview flag into the cache key', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    await getEventSlugRedirect('old-slug-k')
    expect(mockUnstableCache.mock.calls[0][1]).toEqual([
      'event-slug-redirect',
      'old-slug-k',
      'no-drafts',
    ])
    vi.stubEnv('SHOW_DRAFT_EVENTS', 'true')
    await getEventSlugRedirect('old-slug-k')
    expect(mockUnstableCache.mock.calls[1][1]).toEqual([
      'event-slug-redirect',
      'old-slug-k',
      'with-drafts',
    ])
  })

  it('returns the current slug', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { events: { slug: 'new-slug' } }, error: null })
    expect(await getEventSlugRedirect('old-slug-b')).toBe('new-slug')
  })

  it('returns null when the current slug equals the old slug', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { events: { slug: 'same' } }, error: null })
    expect(await getEventSlugRedirect('same')).toBeNull()
  })

  it('reports a query error and throws instead of returning a cacheable null', async () => {
    const dbError = { code: '57014', message: 'timeout' }
    mockMaybeSingle.mockResolvedValue({ data: null, error: dbError })
    await expect(getEventSlugRedirect('old-slug-c')).rejects.toBe(dbError)
    expect(mockHandleDataError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({ operation: 'getEventSlugRedirect' }),
      null
    )
  })
})
