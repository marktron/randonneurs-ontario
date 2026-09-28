/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddRiderDialog } from '@/components/admin/add-rider-dialog'
import { searchRiders } from '@/lib/actions/riders'
import { addRegistration } from '@/lib/actions/results'
import { toast } from 'sonner'

vi.mock('@/lib/actions/riders', () => ({
  searchRiders: vi.fn(),
  createRider: vi.fn(),
}))

vi.mock('@/lib/actions/results', () => ({
  createResult: vi.fn(),
  addRegistration: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/lib/season', () => ({
  getCurrentSeason: () => 2026,
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

// addRegistration now resolves membership status server-side
// (lib/actions/results.ts resolveAdminRegistrationStatus) instead of always
// writing 'registered'. A rider added without a valid membership must not
// look like an ordinary successful add — a plain success toast would hide
// that they're excluded from start lists and cards until re-checked.
describe('AddRiderDialog — membership warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchRiders).mockResolvedValue(RIDERS)
  })

  async function searchPickAndAdd(user: ReturnType<typeof userEvent.setup>) {
    render(<AddRiderDialog {...baseProps} />)
    await user.type(screen.getByPlaceholderText(/Search by name or email/), 'Paul')
    await waitFor(() => expect(screen.getByText('Paul Young')).toBeTruthy())
    await user.click(screen.getByText('Paul Young'))
    await user.click(screen.getByRole('button', { name: /Add Rider/ }))
  }

  it('shows a plain success toast when membership is valid', async () => {
    const user = userEvent.setup()
    vi.mocked(addRegistration).mockResolvedValue({
      success: true,
      data: { membershipStatus: 'valid' },
    })

    await searchPickAndAdd(user)

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added Paul Young'))
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('warns when the rider has no membership on file', async () => {
    const user = userEvent.setup()
    vi.mocked(addRegistration).mockResolvedValue({
      success: true,
      data: { membershipStatus: 'none' },
    })

    await searchPickAndAdd(user)

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Added Paul Young. No 2026 membership found. They won't appear on start lists or cards until membership is re-checked."
      )
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('warns when the rider already used their trial membership', async () => {
    const user = userEvent.setup()
    vi.mocked(addRegistration).mockResolvedValue({
      success: true,
      data: { membershipStatus: 'trial-used' },
    })

    await searchPickAndAdd(user)

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Added Paul Young. Trial membership already used. They won't appear on start lists or cards until membership is re-checked."
      )
    )
  })

  it('warns when membership could not be verified', async () => {
    const user = userEvent.setup()
    vi.mocked(addRegistration).mockResolvedValue({
      success: true,
      data: { membershipStatus: 'check-failed' },
    })

    await searchPickAndAdd(user)

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Added Paul Young. Couldn't verify membership (CCN unavailable). They won't appear on start lists or cards until membership is re-checked."
      )
    )
  })
})
