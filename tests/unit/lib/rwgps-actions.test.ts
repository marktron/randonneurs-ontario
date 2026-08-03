import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchRwgpsRoute = vi.fn()
const mockFetchRwgpsControls = vi.fn()

vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsRoute: (id: string, privacyCode?: string | null) =>
    mockFetchRwgpsRoute(id, privacyCode),
  fetchRwgpsControls: (id: string) => mockFetchRwgpsControls(id),
}))

import { loadRwgpsRoute, loadRwgpsControls } from '@/lib/actions/rwgps'

describe('loadRwgpsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the fetched route on success', async () => {
    mockFetchRwgpsRoute.mockResolvedValueOnce({
      name: 'Toronto Loop 200',
      distanceKm: 203.5,
      controls: [{ name: 'Start', distance: '0.0' }],
    })

    const result = await loadRwgpsRoute('47170397', 'ABC123')

    expect(mockFetchRwgpsRoute).toHaveBeenCalledWith('47170397', 'ABC123')
    expect(result).toEqual({
      success: true,
      data: {
        name: 'Toronto Loop 200',
        distanceKm: 203.5,
        controls: [{ name: 'Start', distance: '0.0' }],
      },
    })
  })

  it('returns the thrown message as a user-facing error instead of throwing', async () => {
    mockFetchRwgpsRoute.mockRejectedValueOnce(
      new Error('No control points found in the RWGPS route.')
    )

    const result = await loadRwgpsRoute('1', null)

    expect(result.success).toBe(false)
    expect(result.error).toBe('No control points found in the RWGPS route.')
  })

  it('falls back to a generic message for non-Error rejections', async () => {
    mockFetchRwgpsRoute.mockRejectedValueOnce('kaboom')

    const result = await loadRwgpsRoute('1', null)

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('loadRwgpsControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed controls on success', async () => {
    mockFetchRwgpsControls.mockResolvedValueOnce([
      { name: 'Start', distance: '0.0' },
      { name: 'Finish', distance: '200.0' },
    ])

    const result = await loadRwgpsControls('47170397')

    expect(mockFetchRwgpsControls).toHaveBeenCalledWith('47170397')
    expect(result).toEqual({
      success: true,
      data: [
        { name: 'Start', distance: '0.0' },
        { name: 'Finish', distance: '200.0' },
      ],
    })
  })

  it('returns the thrown message as a user-facing error instead of throwing', async () => {
    mockFetchRwgpsControls.mockRejectedValueOnce(new Error('Failed to fetch route: 404 Not Found'))

    const result = await loadRwgpsControls('nope')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to fetch route: 404 Not Found')
  })
})
