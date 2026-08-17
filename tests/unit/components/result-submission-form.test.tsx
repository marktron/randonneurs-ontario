/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
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
    usedDigitalCard: false,
    preRideDate: null,
    preRideStartTime: null,
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

      // The "Finished" status is pre-selected, so the finish-time input is visible
      expect(screen.getByLabelText('Finish Time')).toBeInTheDocument()
    })

    it('falls back to elapsed-time inputs when the event has no start time', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventStartTime: null }}
        />
      )

      // No start time → form falls back to the original elapsed hours/minutes inputs
      expect(screen.getByText('Elapsed Time')).toBeInTheDocument()
      expect(screen.getByText(/this event doesn’t have a recorded start time/i)).toBeInTheDocument()
    })

    it('still shows a 2-day selector for an early-morning 200 km, covering the buffer day', () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      // 06:00 + 13:30 is same-day, but the picker always offers one buffer
      // day past the cutoff so an over-limit finisher can record their real
      // finish day — so a 2-button day selector still renders.
      const group = screen.getByRole('radiogroup', { name: /finish day/i })
      expect(group).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(2)
    })

    it('shows a day selector when the event window crosses midnight, including the buffer day', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            eventStartTime: '14:00',
            eventDistance: 200,
          }}
        />
      )

      // 14:00 + 13:30 = 03:30 next day, plus one buffer day past the cutoff,
      // so a 3-button day selector should render
      const group = screen.getByRole('radiogroup', { name: /finish day/i })
      expect(group).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(3)
    })

    it('shows an OTL warning when the typed finish time exceeds the ACP cutoff', async () => {
      const user = userEvent.setup()
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            eventStartTime: '06:00',
            eventDistance: 200,
          }}
        />
      )

      // 06:00 + 14:00 = 20:00, 30 min past the 200 km / 13:30 cutoff
      await user.type(screen.getByLabelText('Finish Time'), '20:00')

      expect(await screen.findByText(/past the ACP cutoff of 13h 30m/i)).toBeInTheDocument()
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
      const submitButton = screen.getByRole('button', { name: /submit your result/i })
      await user.click(submitButton)

      // Form should not submit without required fields
      expect(mockSubmitRiderResult).not.toHaveBeenCalled()
    })

    it('submits when a complete finish time is entered', async () => {
      const user = userEvent.setup()
      render(<ResultSubmissionForm {...defaultProps} />)

      await user.type(screen.getByLabelText('Finish Time'), '20:00')
      await user.click(screen.getByRole('button', { name: /submit your result/i }))

      await waitFor(() => {
        expect(mockSubmitRiderResult).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'finished', finishTime: '12:00' })
        )
      })
    })
  })

  describe('finish time validation', () => {
    it('shows an inline error naming AM/PM when the finish time is empty on submit', async () => {
      const user = userEvent.setup()
      render(<ResultSubmissionForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /submit your result/i }))

      expect(
        await screen.findByText(/enter your finish time, including AM or PM/i)
      ).toBeInTheDocument()
      expect(mockSubmitRiderResult).not.toHaveBeenCalled()
    })

    it('calls out a partially-entered time (missing AM/PM) on submit', async () => {
      const user = userEvent.setup()
      render(<ResultSubmissionForm {...defaultProps} />)

      // Simulate a desktop browser where the rider typed the hour and minute
      // but never set the AM/PM segment: value stays "" and badInput is true.
      const timeInput = screen.getByLabelText('Finish Time')
      Object.defineProperty(timeInput, 'validity', {
        value: { badInput: true },
        configurable: true,
      })

      await user.click(screen.getByRole('button', { name: /submit your result/i }))

      expect(await screen.findByText(/set AM or PM/i)).toBeInTheDocument()
      expect(mockSubmitRiderResult).not.toHaveBeenCalled()
    })

    it('shows a live hint when the rider leaves the field with a partial time', async () => {
      render(<ResultSubmissionForm {...defaultProps} />)

      const timeInput = screen.getByLabelText('Finish Time')
      Object.defineProperty(timeInput, 'validity', {
        value: { badInput: true },
        configurable: true,
      })
      fireEvent.blur(timeInput)

      expect(await screen.findByText(/set AM or PM/i)).toBeInTheDocument()
      expect(mockSubmitRiderResult).not.toHaveBeenCalled()
    })

    it('clears the inline error once the rider fixes the time', async () => {
      const user = userEvent.setup()
      render(<ResultSubmissionForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /submit your result/i }))
      expect(
        await screen.findByText(/enter your finish time, including AM or PM/i)
      ).toBeInTheDocument()

      await user.type(screen.getByLabelText('Finish Time'), '20:00')

      expect(
        screen.queryByText(/enter your finish time, including AM or PM/i)
      ).not.toBeInTheDocument()
    })

    it('requires elapsed hours and minutes when the event has no start time', async () => {
      const user = userEvent.setup()
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventStartTime: null }}
        />
      )

      await user.click(screen.getByRole('button', { name: /submit your result/i }))

      expect(await screen.findByText(/enter your elapsed time/i)).toBeInTheDocument()
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

      // "Finished" is pre-selected, so the finish-time field shows, but not control cards
      expect(screen.getByLabelText('Finish Time')).toBeInTheDocument()
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

  describe('digital brevet card riders', () => {
    it('hides control card photos when the rider used the digital card', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventType: 'brevet', usedDigitalCard: true }}
        />
      )

      expect(screen.getByLabelText('Finish Time')).toBeInTheDocument()
      expect(screen.queryByText('Control Card Photos')).not.toBeInTheDocument()
    })

    it('shows control card photos when the rider did not use the digital card', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{ ...mockInitialData, eventType: 'brevet', usedDigitalCard: false }}
        />
      )

      expect(screen.getByText('Control Card Photos')).toBeInTheDocument()
    })
  })

  describe('pre-ride anchored results', () => {
    it('anchors the day picker and elapsed time to the approved pre-ride start, not the event date', async () => {
      const user = userEvent.setup()
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            eventDate: '2026-08-04',
            eventStartTime: '05:00',
            eventDistance: 2000,
            preRideDate: '2026-07-25',
            preRideStartTime: '05:00',
          }}
        />
      )

      // Day options must span the pre-ride start (Jul 25 … Aug 2), not the
      // official event date (Aug 4).
      const group = screen.getByRole('radiogroup', { name: /finish day/i })
      const buttons = within(group).getAllByRole('radio')
      expect(buttons[0]).toHaveTextContent(/Jul 25/)
      expect(buttons[buttons.length - 1]).toHaveTextContent(/Aug 2/)
      expect(screen.queryByText(/Aug 4/)).not.toBeInTheDocument()

      // Picking a day + time computes elapsed from the 07/25 05:00 pre-ride
      // start, not the event's 08/04 05:00 start.
      await user.click(within(group).getByText(/Jul 26/))
      await user.type(screen.getByLabelText('Finish Time'), '05:00')

      expect(await screen.findByText(/Elapsed: 24h 00m/)).toBeInTheDocument()
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

  describe('almost-done banner', () => {
    it('shows the almost-done banner when finished with no track', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            currentStatus: 'finished',
            gpxUrl: null,
            gpxFilePath: null,
            submittedAt: null,
          }}
        />
      )

      expect(screen.getByText(/almost done/i)).toBeInTheDocument()
      expect(screen.getByText(/strava link or gpx file/i)).toBeInTheDocument()
    })

    it('shows the previously-submitted banner even without a track after submission', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            currentStatus: 'finished',
            gpxUrl: null,
            gpxFilePath: null,
            submittedAt: '2025-05-15T12:00:00Z',
          }}
        />
      )

      expect(screen.getByText('Previously Submitted')).toBeInTheDocument()
      expect(screen.queryByText(/almost done/i)).not.toBeInTheDocument()
    })

    it('shows the previously-submitted banner when a track exists', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            currentStatus: 'finished',
            gpxUrl: 'https://strava.com/activities/123',
            gpxFilePath: null,
            submittedAt: '2025-05-15T12:00:00Z',
          }}
        />
      )

      expect(screen.getByText('Previously Submitted')).toBeInTheDocument()
      expect(screen.queryByText(/almost done/i)).not.toBeInTheDocument()
    })

    it('shows no banner for a pending unsubmitted result', () => {
      render(
        <ResultSubmissionForm
          token="test-token-123"
          initialData={{
            ...mockInitialData,
            currentStatus: 'pending',
            submittedAt: null,
          }}
        />
      )

      expect(screen.queryByText(/almost done/i)).not.toBeInTheDocument()
      expect(screen.queryByText('Previously Submitted')).not.toBeInTheDocument()
    })
  })
})
