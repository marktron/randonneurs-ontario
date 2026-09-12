/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRegisteredSlugs } from '@/hooks/use-registered-slugs'
import type { MyUpcomingRide } from '@/lib/actions/my-rides'
import type { ActionResult } from '@/types/actions'

// Mock server action
const mockGetMyUpcomingRides = vi.fn<(email: string) => Promise<ActionResult<MyUpcomingRide[]>>>()

vi.mock('@/lib/actions/my-rides', () => ({
  getMyUpcomingRides: (...args: unknown[]) => mockGetMyUpcomingRides(args[0] as string),
}))

const sampleRides: MyUpcomingRide[] = [
  {
    slug: 'test-ride-200km-2026-04-15',
    name: 'Test Ride',
    date: '2026-04-15',
    distance: 200,
    startTime: '07:00',
    startLocation: 'City Hall',
    chapterName: 'Toronto',
  },
  {
    slug: 'spring-ride-100km-2026-05-01',
    name: 'Spring Ride',
    date: '2026-05-01',
    distance: 100,
    startTime: '08:00',
    startLocation: 'Park',
    chapterName: 'Ottawa',
  },
]

describe('useRegisteredSlugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty set and does not call the action when there is no saved email', async () => {
    const { result } = renderHook(() => useRegisteredSlugs())

    expect(result.current).toEqual(new Set())
    // Give any stray microtasks a chance to run before asserting the negative.
    await waitFor(() => {
      expect(mockGetMyUpcomingRides).not.toHaveBeenCalled()
    })
  })

  it('calls the action with the saved email and returns a set of the returned slugs', async () => {
    localStorage.setItem(
      'ro-registration',
      JSON.stringify({ email: 'test@example.com', firstName: 'John' })
    )
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: sampleRides })

    const { result } = renderHook(() => useRegisteredSlugs())

    await waitFor(() => {
      expect(result.current.size).toBe(2)
    })

    expect(mockGetMyUpcomingRides).toHaveBeenCalledWith('test@example.com')
    expect(result.current.has('test-ride-200km-2026-04-15')).toBe(true)
    expect(result.current.has('spring-ride-100km-2026-05-01')).toBe(true)
  })

  it('leaves the set empty when the action reports failure', async () => {
    localStorage.setItem('ro-registration', JSON.stringify({ email: 'test@example.com' }))
    mockGetMyUpcomingRides.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() => useRegisteredSlugs())

    await waitFor(() => {
      expect(mockGetMyUpcomingRides).toHaveBeenCalledWith('test@example.com')
    })

    expect(result.current).toEqual(new Set())
  })
})
