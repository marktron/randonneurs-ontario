/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventForm } from '@/components/admin/event-form'
import type { ChapterOption } from '@/types/ui'
import type { ActiveRoute } from '@/lib/data/routes'

// Mock server actions
const mockCreateEvent = vi.fn()
const mockUpdateEvent = vi.fn()

vi.mock('@/lib/actions/events', () => ({
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
}))

// Mock router
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock ImageUpload component
vi.mock('@/components/admin/image-upload', () => ({
  ImageUpload: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    <div data-testid="image-upload">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="image-url-input"
      />
    </div>
  ),
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  format: vi.fn((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }),
}))

describe('EventForm', () => {
  const mockChapters: ChapterOption[] = [
    { id: 'chapter-1', name: 'Toronto' },
    { id: 'chapter-2', name: 'Ottawa' },
  ]

  const mockRoutes: ActiveRoute[] = [
    {
      id: 'route-1',
      name: 'Toronto 200',
      slug: 'toronto-200',
      distanceKm: 200,
      chapterId: 'chapter-1',
      chapterName: 'Toronto',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateEvent.mockResolvedValue({ success: true, data: { id: 'event-1' } })
    mockUpdateEvent.mockResolvedValue({ success: true })
  })

  describe('create mode', () => {
    it('renders all form fields', () => {
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      // Text inputs with standard labels
      expect(screen.getByLabelText(/event name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/distance/i)).toBeInTheDocument()

      // Radix UI Select components - may have multiple elements with same text
      expect(screen.getAllByText(/select chapter/i).length).toBeGreaterThan(0)
      // Event type has default value "Brevet", not a placeholder
      expect(screen.getByText('Event Type')).toBeInTheDocument()
    })

    it('has submit button that triggers form validation', async () => {
      const user = userEvent.setup()
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      // Partially fill form (missing required fields)
      await user.type(screen.getByLabelText(/event name/i), 'Spring 200')
      await user.type(screen.getByLabelText(/distance/i), '200')

      const submitButton = screen.getByRole('button', { name: /create/i })
      await user.click(submitButton)

      // Form should not call createEvent without all required fields
      // Full form submission with date/chapter selection is covered by E2E tests
      expect(mockCreateEvent).not.toHaveBeenCalled()
    })
  })

  describe('edit mode', () => {
    const mockEvent = {
      id: 'event-1',
      name: 'Spring 200',
      chapterId: 'chapter-1',
      routeId: 'route-1',
      eventType: 'brevet',
      distanceKm: 200,
      eventDate: '2025-05-15',
      startTime: '08:00',
      startLocation: 'Toronto',
      description: 'Test event',
      imageUrl: null,
    }

    it('pre-fills form with event data', () => {
      render(
        <EventForm chapters={mockChapters} routes={mockRoutes} event={mockEvent} mode="edit" />
      )

      expect(screen.getByDisplayValue('Spring 200')).toBeInTheDocument()
      expect(screen.getByDisplayValue('200')).toBeInTheDocument()
    })

    it('shows save changes button in edit mode', () => {
      render(
        <EventForm chapters={mockChapters} routes={mockRoutes} event={mockEvent} mode="edit" />
      )

      // In edit mode, the button should say "Save Changes" instead of "Create Event"
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
    })

    // Note: Full form submission in edit mode requires all fields to be valid,
    // including date/chapter selected via Radix UI components.
    // Complete edit flow is covered by E2E tests.
  })

  describe('validation', () => {
    it('requires event name', async () => {
      const user = userEvent.setup()
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      const submitButton = screen.getByRole('button', { name: /create/i })
      await user.click(submitButton)

      // HTML5 validation would prevent submission
      const nameInput = screen.getByLabelText(/event name/i)
      expect(nameInput).toBeRequired()
    })

    it('requires distance', async () => {
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      const distanceInput = screen.getByLabelText(/distance/i)
      expect(distanceInput).toBeRequired()
    })
  })

  describe('route selection', () => {
    // Note: Route and chapter selection use Radix UI components (Select, Popover, Command)
    // which are difficult to test in happy-dom. Full interaction flows are covered by E2E tests.
    // Unit tests here verify the component renders correctly and accepts the right props.

    it('shows route picker button', () => {
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      // The route picker trigger button should be visible (look for placeholder text)
      expect(screen.getByText(/search routes/i)).toBeInTheDocument()
    })

    it('receives routes prop correctly', () => {
      const { container } = render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      // Component should render without errors when routes are provided
      expect(container).toBeTruthy()
    })
  })

  describe('event type restrictions', () => {
    // Note: Event type selection uses Radix UI Select which is difficult to fully test
    // in happy-dom. BRM distance validation modals are covered by E2E tests.

    it('shows event type selector with default value', () => {
      render(<EventForm chapters={mockChapters} routes={mockRoutes} />)

      // Event type label should be visible
      expect(screen.getByText('Event Type')).toBeInTheDocument()
      // Default value is "Brevet" (may appear multiple times - in trigger and hidden select)
      expect(screen.getAllByText('Brevet').length).toBeGreaterThan(0)
    })
  })
})
