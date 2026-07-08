/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRegistrationForm } from '@/hooks/use-registration-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}))

const mockGetUpcomingEvents = vi.fn()
vi.mock('@/lib/actions/rider-results', () => ({
  getUpcomingEventsByEventId: (...args: unknown[]) => mockGetUpcomingEvents(...args),
}))

describe('useRegistrationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetUpcomingEvents.mockResolvedValue({ success: true, data: [] })
  })

  it('loads saved registration data on mount', () => {
    localStorage.setItem(
      'ro-registration',
      JSON.stringify({
        firstName: 'Anna',
        lastName: 'Smith',
        email: 'anna@example.com',
        phone: '555-1234',
        gender: 'F',
        shareRegistration: false,
        emergencyContactName: 'Bob',
        emergencyContactPhone: '555-9876',
      })
    )

    const { result } = renderHook(() => useRegistrationForm())

    expect(result.current.firstName).toBe('Anna')
    expect(result.current.email).toBe('anna@example.com')
    expect(result.current.gender).toBe('F')
    expect(result.current.shareRegistration).toBe(false)
  })

  it('persists rider data, flips success, and refreshes the router on success', () => {
    const { result } = renderHook(() => useRegistrationForm())

    act(() => result.current.setFirstName('Anna'))
    act(() => result.current.setLastName('Smith'))
    act(() => result.current.setEmail('anna@example.com'))
    act(() => result.current.handleRegistrationResult({ success: true }))

    expect(result.current.success).toBe(true)
    expect(mockRefresh).toHaveBeenCalled()
    const saved = JSON.parse(localStorage.getItem('ro-registration') || '{}')
    expect(saved.firstName).toBe('Anna')
    expect(saved.email).toBe('anna@example.com')
  })

  it('opens the match dialog and reports pending context on needsRiderMatch', () => {
    const onNeedsMatch = vi.fn()
    const { result } = renderHook(() => useRegistrationForm())
    const matchResult = {
      success: false,
      needsRiderMatch: true,
      matchCandidates: [{ id: 'r1' } as never],
    }

    act(() => result.current.handleRegistrationResult(matchResult, { onNeedsMatch }))

    expect(result.current.matchDialogOpen).toBe(true)
    expect(result.current.matchCandidates).toHaveLength(1)
    expect(onNeedsMatch).toHaveBeenCalledWith(matchResult)
    expect(result.current.success).toBe(false)
  })

  it('surfaces membership errors and closes the dialog', () => {
    const { result } = renderHook(() => useRegistrationForm())

    act(() =>
      result.current.handleRegistrationResult({ success: false, membershipError: 'trial-used' })
    )

    expect(result.current.membershipErrorVariant).toBe('trial-used')
    expect(result.current.matchDialogOpen).toBe(false)
  })

  it('falls back to the error banner', () => {
    const { result } = renderHook(() => useRegistrationForm())

    act(() => result.current.handleRegistrationResult({ success: false, error: 'Nope' }))

    expect(result.current.error).toBe('Nope')
    expect(result.current.success).toBe(false)
  })

  it('uses a default error message when the action returns none', () => {
    const { result } = renderHook(() => useRegistrationForm())

    act(() => result.current.handleRegistrationResult({ success: false }))

    expect(result.current.error).toBe('Registration failed')
  })

  it('fetches upcoming events after success when configured', async () => {
    mockGetUpcomingEvents.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'e1',
          name: 'Sample Brevet',
          date: '2099-01-01',
          distance: 200,
          slug: 'sample-brevet',
          startLocation: null,
        },
      ],
    })
    const { result } = renderHook(() => useRegistrationForm({ upcomingEventsEventId: 'event-1' }))

    act(() => result.current.handleRegistrationResult({ success: true }))

    await waitFor(() => expect(result.current.upcomingEvents).toHaveLength(1))
    expect(mockGetUpcomingEvents).toHaveBeenCalledWith('event-1', 3)
    expect(result.current.loadingEvents).toBe(false)
  })

  it('does not fetch upcoming events when no event id is configured', () => {
    const { result } = renderHook(() => useRegistrationForm())

    act(() => result.current.handleRegistrationResult({ success: true }))

    expect(mockGetUpcomingEvents).not.toHaveBeenCalled()
  })
})
