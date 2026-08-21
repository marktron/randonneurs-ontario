/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventStatusSelect } from '@/components/admin/event-status-select'

const mockUpdateEventStatus = vi.fn()

vi.mock('@/lib/actions/events', () => ({
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('EventStatusSelect cancel flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEventStatus.mockResolvedValue({ success: true })
  })

  async function selectCancelled() {
    const user = userEvent.setup()
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    const option = await screen.findByRole('option', { name: /cancelled/i })
    await user.click(option)
    return user
  }

  it('opens the modal when admin selects Cancelled even with zero results', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="A brevet through Toronto."
      />
    )

    await selectCancelled()

    expect(await screen.findByRole('dialog', { name: /cancel event/i })).toBeInTheDocument()
  })

  it('pre-fills the description textarea with the current description', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="A brevet through Toronto."
      />
    )

    await selectCancelled()

    const textarea = await screen.findByRole('textbox')
    expect(textarea).toHaveValue('A brevet through Toronto.')
  })

  it('shows a results-deletion warning when resultsCount > 0', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={5}
        initialDescription=""
      />
    )

    await selectCancelled()

    expect(await screen.findByText(/5 results.*deleted/i)).toBeInTheDocument()
  })

  it('does not show the results warning when resultsCount is 0', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription=""
      />
    )

    await selectCancelled()

    expect(screen.queryByText(/results.*deleted/i)).not.toBeInTheDocument()
  })

  it('calls updateEventStatus with the edited description on confirm', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="Original description."
      />
    )

    const user = await selectCancelled()

    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'CANCELLED: weather.\n\nOriginal description.')

    const confirmButton = await screen.findByRole('button', { name: /cancel event/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'cancelled', {
        description: 'CANCELLED: weather.\n\nOriginal description.',
      })
    })
  })

  it('passes description as null when textarea is cleared', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription="Original description."
      />
    )

    const user = await selectCancelled()

    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)

    const confirmButton = await screen.findByRole('button', { name: /cancel event/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'cancelled', {
        description: null,
      })
    })
  })

  it('does not open the modal when admin selects Completed', async () => {
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription=""
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /completed/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'completed', undefined)
    })
  })
})

describe('EventStatusSelect draft handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEventStatus.mockResolvedValue({ success: true })
  })

  it('offers Draft as an option only while the event is a draft', async () => {
    const user = userEvent.setup()
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="draft"
        resultsCount={0}
        initialDescription={null}
      />
    )

    await user.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: /draft/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /scheduled/i })).toBeInTheDocument()
  })

  it('does not offer Draft for a scheduled event', async () => {
    const user = userEvent.setup()
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="scheduled"
        resultsCount={0}
        initialDescription={null}
      />
    )

    await user.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: /completed/i })
    expect(screen.queryByRole('option', { name: /draft/i })).toBeNull()
  })

  it('publishes a draft by choosing Scheduled', async () => {
    const user = userEvent.setup()
    render(
      <EventStatusSelect
        eventId="event-1"
        initialStatus="draft"
        resultsCount={0}
        initialDescription={null}
      />
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /scheduled/i }))

    await waitFor(() =>
      expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'scheduled', undefined)
    )
    const { toast } = await import('sonner')
    expect(toast.success).toHaveBeenCalledWith('Event published')
  })
})
