import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchRwgpsTrack = vi.fn()
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsTrack: (id: string) => mockFetchRwgpsTrack(id),
}))
// Pass-through cache: each call runs the wrapped function.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { loadRouteTrack } from '@/lib/data/route-track'

const points = [
  { lat: 44, lng: -79, km: 0 },
  { lat: 44.05, lng: -79, km: 5.56 },
  { lat: 44, lng: -79, km: 11.12 },
]

describe('loadRouteTrack', () => {
  beforeEach(() => mockFetchRwgpsTrack.mockReset())

  it('builds a track from the RWGPS response', async () => {
    mockFetchRwgpsTrack.mockResolvedValue({ totalKm: 11.12, points })
    const track = await loadRouteTrack('123')
    expect(track).toMatchObject({ totalKm: 11.1, isLoop: true })
  })

  it('returns null when RWGPS fails, and retries on the next call', async () => {
    mockFetchRwgpsTrack.mockRejectedValueOnce(new Error('503'))
    expect(await loadRouteTrack('123')).toBeNull()
    mockFetchRwgpsTrack.mockResolvedValue({ totalKm: 11.12, points })
    expect(await loadRouteTrack('123')).not.toBeNull()
  })

  it('returns null when the route has no usable track', async () => {
    mockFetchRwgpsTrack.mockResolvedValue({ totalKm: 11.12, points: [] })
    expect(await loadRouteTrack('123')).toBeNull()
  })
})
