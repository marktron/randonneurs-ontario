/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyRidesSection } from '@/components/my-rides-section'
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

describe('MyRidesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing with no localStorage data', () => {
    const { container } = render(<MyRidesSection />)

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when server returns empty array', async () => {
    localStorage.setItem(
      'ro-registration',
      JSON.stringify({ email: 'test@example.com', firstName: 'John' })
    )
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: [] })

    const { container } = render(<MyRidesSection />)

    // Wait for the effect to complete
    await waitFor(() => {
      expect(mockGetMyUpcomingRides).toHaveBeenCalledWith('test@example.com')
    })

    expect(container.querySelector('section')).not.toBeInTheDocument()
  })

  it('renders ride list when server returns rides', async () => {
    localStorage.setItem(
      'ro-registration',
      JSON.stringify({ email: 'test@example.com', firstName: 'John' })
    )
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: sampleRides })

    render(<MyRidesSection />)

    await waitFor(() => {
      expect(screen.getByText('Your Upcoming Rides')).toBeInTheDocument()
    })

    expect(screen.getByText('Welcome back, John')).toBeInTheDocument()
    expect(screen.getByText('Test Ride')).toBeInTheDocument()
    expect(screen.getByText('Spring Ride')).toBeInTheDocument()
  })

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem('ro-registration', 'not-json{{{')

    const { container } = render(<MyRidesSection />)

    // Should not crash or call the server action
    await waitFor(() => {
      expect(mockGetMyUpcomingRides).not.toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when localStorage has no email', async () => {
    localStorage.setItem('ro-registration', JSON.stringify({ firstName: 'John' }))

    const { container } = render(<MyRidesSection />)

    await waitFor(() => {
      expect(mockGetMyUpcomingRides).not.toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe('')
  })

  it('renders without firstName greeting when firstName is missing', async () => {
    localStorage.setItem('ro-registration', JSON.stringify({ email: 'test@example.com' }))
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: sampleRides })

    render(<MyRidesSection />)

    await waitFor(() => {
      expect(screen.getByText('Your Upcoming Rides')).toBeInTheDocument()
    })

    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument()
  })

  it('collapses to 3 rides and expands on click', async () => {
    const manyRides: MyUpcomingRide[] = Array.from({ length: 5 }, (_, i) => ({
      slug: `ride-${i}`,
      name: `Ride ${i + 1}`,
      date: `2026-0${i + 3}-01`,
      distance: 200,
      startTime: '07:00',
      startLocation: 'Start',
      chapterName: 'Toronto',
    }))

    localStorage.setItem(
      'ro-registration',
      JSON.stringify({ email: 'test@example.com', firstName: 'John' })
    )
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: manyRides })

    render(<MyRidesSection />)

    await waitFor(() => {
      expect(screen.getByText('Your Upcoming Rides')).toBeInTheDocument()
    })

    // Only 3 rides visible initially
    expect(screen.getByText('Ride 1')).toBeInTheDocument()
    expect(screen.getByText('Ride 3')).toBeInTheDocument()
    expect(screen.queryByText('Ride 4')).not.toBeInTheDocument()

    // expand button
    const expandButton = screen.getByText('Show 2 more events')
    expect(expandButton).toBeInTheDocument()

    // Click to expand
    await userEvent.click(expandButton)

    // All rides visible
    expect(screen.getByText('Ride 4')).toBeInTheDocument()
    expect(screen.getByText('Ride 5')).toBeInTheDocument()

    // Button text changed
    expect(screen.getByText('Show less')).toBeInTheDocument()

    // Click to collapse
    await userEvent.click(screen.getByText('Show less'))

    // Back to collapsed
    expect(screen.queryByText('Ride 4')).not.toBeInTheDocument()
    expect(screen.getByText('Show 2 more events')).toBeInTheDocument()
  })

  it('does not show expand button when 3 or fewer rides', async () => {
    localStorage.setItem(
      'ro-registration',
      JSON.stringify({ email: 'test@example.com', firstName: 'John' })
    )
    mockGetMyUpcomingRides.mockResolvedValue({ success: true, data: sampleRides })

    render(<MyRidesSection />)

    await waitFor(() => {
      expect(screen.getByText('Your Upcoming Rides')).toBeInTheDocument()
    })

    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
    expect(screen.queryByText('Show less')).not.toBeInTheDocument()
  })
})
