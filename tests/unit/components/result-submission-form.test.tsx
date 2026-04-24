/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResultSubmissionForm } from '@/components/result-submission-form'
import type { ResultSubmissionData } from '@/lib/actions/rider-results'

// Mock server actions
const mockSubmitRiderResult = vi.fn()
const mockCreateResultUploadUrl = vi.fn()
const mockConfirmResultUpload = vi.fn()
const mockDeleteResultFile = vi.fn()
const mockGetRiderUpcomingEvents = vi.fn()
const mockGetChapterUpcomingEvents = vi.fn()

vi.mock('@/lib/actions/rider-results', () => ({
  submitRiderResult: (...args: unknown[]) => mockSubmitRiderResult(...args),
  createResultUploadUrl: (...args: unknown[]) => mockCreateResultUploadUrl(...args),
  confirmResultUpload: (...args: unknown[]) => mockConfirmResultUpload(...args),
  deleteResultFile: (...args: unknown[]) => mockDeleteResultFile(...args),
  getRiderUpcomingEvents: (...args: unknown[]) => mockGetRiderUpcomingEvents(...args),
  getChapterUpcomingEvents: (...args: unknown[]) => mockGetChapterUpcomingEvents(...args),
}))

// Mock the Supabase browser client used for direct uploads
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}))

// Mock browser-side image compression — pass through unchanged in tests
vi.mock('@/lib/image-compression', () => ({
  compressImageForUpload: vi.fn(async (file: File) => file),
}))

// Mock router
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

// Mock date-fns - include format function that returns human-readable dates
vi.mock('date-fns', () => ({
  format: vi.fn((date: Date, formatStr: string) => {
    // For 'EEEE, MMMM d, yyyy' format (used in component)
    if (formatStr && formatStr.includes('EEEE')) {
      return 'Thursday, May 15, 2025'
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }),
}))

describe('ResultSubmissionForm', () => {
  const mockInitialData: ResultSubmissionData = {
    eventId: 'event-1',
    eventName: 'Spring 200',
    riderName: 'John Doe',
    riderEmail: 'john@example.com',
    eventDate: '2025-05-15',
    eventStartTime: '08:00',
    eventDistance: 200,
    eventType: 'brevet',
    chapterName: 'Toronto',
    chapterSlug: 'toronto',
    riderId: 'rider-1',
    canSubmit: true,
    currentStatus: 'pending',
    finishTime: null,
    gpxUrl: null,
    gpxFilePath: null,
    controlCardFrontPath: null,
    controlCardBackPath: null,
    riderNotes: null,
    submittedAt: null,
  }

  const defaultProps = {
    token: 'test-token-123',
    initialData: mockInitialData,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmitRiderResult.mockResolvedValue({ success: true })
    mockCreateResultUploadUrl.mockResolvedValue({
      success: true,
      data: {
        signedUrl: 'https://example.com/signed-upload-url',
        uploadToken: 'signed-token',
        path: 'test.gpx',
        publicUrl: 'https://example.com/test.gpx',
      },
    })
    mockConfirmResultUpload.mockResolvedValue({
      success: true,
      data: { path: 'test.gpx', url: 'https://example.com/test.gpx' },
    })
    mockDeleteResultFile.mockResolvedValue({ success: true })
    mockGetRiderUpcomingEvents.mockResolvedValue({ success: true, data: [] })
    mockGetChapterUpcomingEvents.mockResolvedValue({ success: true, data: [] })
  })

  describe('rendering', () => {
    it('renders event information', () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      expect(screen.getByText('Spring 200')).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('renders status select field', () => {
      const { container } = render(<ResultSubmissionForm {...defaultProps} />)

      // Radix UI Select - check label exists and trigger is present
      expect(screen.getByText('Finish Status')).toBeInTheDocument()
      expect(container.querySelector('#status')).toBeInTheDocument()
    })

    // Note: Radix UI Select interactions are difficult to test in happy-dom.
    // Full status selection and time input visibility is covered by E2E tests.

    it('renders notes textarea', () => {
      const { container } = render(<ResultSubmissionForm {...defaultProps} />)

      // Notes field has label "Feedback for Ride Organizers (optional)"
      expect(screen.getByText(/feedback for ride organizers/i)).toBeInTheDocument()
      expect(container.querySelector('#riderNotes')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('pre-selects finished status by default', () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      // The "Finished" status is pre-selected, so time inputs should be visible
      expect(screen.getByText('Elapsed Time')).toBeInTheDocument()
    })

    it('shows the event start time in the elapsed time helper text', () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      expect(screen.getByText(/the time the event starts \(8:00 AM\)/i)).toBeInTheDocument()
    })

    it('falls back to TBD when the event has no start time', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventStartTime: null }}
        />
      )

      expect(screen.getByText(/the time the event starts \(TBD\)/i)).toBeInTheDocument()
    })

    // Note: Status selection and time validation with Radix UI Select
    // are difficult to test in happy-dom. These flows are covered by E2E tests.
  })

  describe('form submission', () => {
    // Note: Full form submission flows require Radix UI Select interactions
    // which are difficult to test in happy-dom. These are covered by E2E tests.
    // Unit tests here verify that the form renders and accepts the right props.

    it('renders submit button', () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      expect(screen.getByRole('button', { name: /submit your result/i })).toBeInTheDocument()
    })

    it('does not call submitRiderResult without required fields', async () => {
      const user = userEvent.setup()
      render(<ResultSubmissionForm {...defaultProps} />)

      // With "finished" pre-selected, the form requires finish time inputs
      // Submitting without filling them should trigger HTML5 validation
      const submitButton = screen.getByRole('button', { name: /submit your result/i })
      await user.click(submitButton)

      // Form should not submit without required fields
      expect(mockSubmitRiderResult).not.toHaveBeenCalled()
    })
  })

  // Note: File upload tests removed because the file inputs are hidden and
  // accessed via button clicks, which is difficult to test in happy-dom.
  // File upload functionality is covered by E2E tests.

  // Note: File deletion tests require files to be displayed, which needs status="finished"
  // to be set via Radix Select. This flow is covered by E2E tests.

  describe('populaire events', () => {
    it('hides control card photos for populaires', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventType: 'populaire' }}
        />
      )

      // "Finished" is pre-selected, so ride evidence should show, but not control cards
      expect(screen.getByText('Elapsed Time')).toBeInTheDocument()
      expect(screen.queryByText('Control Card Photos')).not.toBeInTheDocument()
    })

    it('shows control card photos for brevets', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventType: 'brevet' }}
        />
      )

      expect(screen.getByText('Control Card Photos')).toBeInTheDocument()
    })
  })

  describe('disabled state', () => {
    it('shows message when canSubmit is false', () => {
      const disabledData: ResultSubmissionData = {
        ...mockInitialData,
        canSubmit: false,
      }

      render(<ResultSubmissionForm token="test-token-123" initialData={disabledData} />)

      // Component shows "Results Already Submitted" heading when canSubmit is false
      expect(screen.getByText('Results Already Submitted')).toBeInTheDocument()
      // When canSubmit is false, the form is not rendered - only the message
      expect(screen.queryByRole('button', { name: /submit your result/i })).not.toBeInTheDocument()
    })
  })
})
