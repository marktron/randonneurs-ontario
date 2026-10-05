import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchRwgpsRouteMap = vi.fn()
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsRouteMap: (id: string) => mockFetchRwgpsRouteMap(id),
}))
// Pass-through cache: each call runs the wrapped function.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { loadRouteMap, loadRouteTrack } from '@/lib/data/route-track'

const points = [
  { lat: 44, lng: -79, km: 0 },
  { lat: 44.05, lng: -79, km: 5.56 },
  { lat: 44, lng: -79, km: 11.12 },
]
const controls = [{ name: 'Cafe', km: 5.6, lat: 44.05, lng: -79 }]

describe('loadRouteTrack', () => {
  beforeEach(() => mockFetchRwgpsRouteMap.mockReset())

  it('builds a track from the RWGPS response', async () => {
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points, controls })
    const track = await loadRouteTrack('123')
    expect(track).toMatchObject({ totalKm: 11.1, isLoop: true })
    expect(track).not.toHaveProperty('controls')
  })

  it('returns null when RWGPS fails, and retries on the next call', async () => {
    mockFetchRwgpsRouteMap.mockRejectedValueOnce(new Error('503'))
    expect(await loadRouteTrack('123')).toBeNull()
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points, controls })
    expect(await loadRouteTrack('123')).not.toBeNull()
  })

  it('returns null when the route has no usable track', async () => {
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points: [], controls })
    expect(await loadRouteTrack('123')).toBeNull()
  })
})

describe('loadRouteMap', () => {
  beforeEach(() => mockFetchRwgpsRouteMap.mockReset())

  it('returns the track and the controls from one RWGPS response', async () => {
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points, controls })
    const map = await loadRouteMap('123')
    expect(map?.track).toMatchObject({ totalKm: 11.1, isLoop: true })
    expect(map?.controls).toEqual(controls)
    expect(mockFetchRwgpsRouteMap).toHaveBeenCalledTimes(1)
  })

  it('returns no controls for a route without any', async () => {
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points, controls: [] })
    expect((await loadRouteMap('123'))?.controls).toEqual([])
  })

  it('returns null when RWGPS fails, and retries on the next call', async () => {
    mockFetchRwgpsRouteMap.mockRejectedValueOnce(new Error('503'))
    expect(await loadRouteMap('123')).toBeNull()
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points, controls })
    expect(await loadRouteMap('123')).not.toBeNull()
  })

  it('returns null when the route has no usable track', async () => {
    mockFetchRwgpsRouteMap.mockResolvedValue({ totalKm: 11.12, points: [], controls })
    expect(await loadRouteMap('123')).toBeNull()
  })
})
