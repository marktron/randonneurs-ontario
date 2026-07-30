/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddRiderDialog } from '@/components/admin/add-rider-dialog'
import { searchRiders } from '@/lib/actions/riders'

vi.mock('@/lib/actions/riders', () => ({
  searchRiders: vi.fn(),
  createRider: vi.fn(),
}))

vi.mock('@/lib/actions/results', () => ({
  createResult: vi.fn(),
  addRegistration: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const RIDERS = [
  { id: 'rider-young', first_name: 'Paul', last_name: 'Young', email: 'young@example.com' },
  { id: 'rider-foley', first_name: 'Paul', last_name: 'Foley', email: 'foley@example.com' },
]

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  eventId: 'event-1',
  eventStatus: 'scheduled',
  season: 2026,
  distanceKm: 200,
  existingRiderIds: new Set<string>(),
}

describe('AddRiderDialog — rider selection feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchRiders).mockResolvedValue(RIDERS)
  })

  async function searchAndPick(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText(/Search by name or email/), 'Paul')
    await waitFor(() => expect(screen.getByText('Paul Young')).toBeTruthy())
    await user.click(screen.getByText('Paul Young'))
  }

  it('shows an explicit selected state once a rider is picked', async () => {
    const user = userEvent.setup()
    render(<AddRiderDialog {...baseProps} />)

    await searchAndPick(user)

    // The picked rider is confirmed by a label, not by colour alone.
    const selected = await screen.findByTestId('selected-rider')
    expect(selected.textContent).toContain('Paul Young')
    expect(selected.textContent).toContain('Selected')
  })

  // The list re-rendering with a single identical-looking row after picking is
  // what made selection invisible: the query is set to the rider's name, which
  // re-triggered the debounced search.
  it('does not re-run the search or re-show the result list after picking', async () => {
    const user = userEvent.setup()
    render(<AddRiderDialog {...baseProps} />)

    await searchAndPick(user)
    const callsAfterPick = vi.mocked(searchRiders).mock.calls.length

    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(vi.mocked(searchRiders).mock.calls.length).toBe(callsAfterPick)
    // Only the selected-rider card names the rider — no look-alike list row.
    expect(screen.getAllByText('Paul Young')).toHaveLength(1)
    expect(screen.queryByText('Paul Foley')).toBeNull()
  })

  it('lets the admin clear the selection and search again', async () => {
    const user = userEvent.setup()
    render(<AddRiderDialog {...baseProps} />)

    await searchAndPick(user)
    await user.click(screen.getByRole('button', { name: /Change/ }))

    expect(screen.queryByTestId('selected-rider')).toBeNull()
    const input = screen.getByPlaceholderText(/Search by name or email/) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('disables the Add Rider button until a rider is selected', async () => {
    const user = userEvent.setup()
    render(<AddRiderDialog {...baseProps} />)

    const addButton = () => screen.getByRole('button', { name: /Add Rider/ })
    expect((addButton() as HTMLButtonElement).disabled).toBe(true)

    await searchAndPick(user)
    expect((addButton() as HTMLButtonElement).disabled).toBe(false)
  })
})
