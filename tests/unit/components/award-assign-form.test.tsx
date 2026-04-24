/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AwardAssignForm, type AwardOption } from '@/components/admin/award-assign-form'

const mockAssignResultAward =
  vi.fn<(...args: unknown[]) => Promise<{ success: boolean; error?: string }>>()
const mockAssignSeasonAward =
  vi.fn<(...args: unknown[]) => Promise<{ success: boolean; error?: string }>>()
const mockSearchRiderResults = vi.fn<(...args: unknown[]) => Promise<unknown[]>>()
const mockSearchRiders =
  vi.fn<
    (
      ...args: unknown[]
    ) => Promise<Array<{ id: string; first_name: string; last_name: string; email: string | null }>>
  >()

vi.mock('@/lib/actions/awards', () => ({
  assignResultAward: (...args: unknown[]) => mockAssignResultAward(...args),
  assignSeasonAward: (...args: unknown[]) => mockAssignSeasonAward(...args),
  searchRiderResults: (...args: unknown[]) => mockSearchRiderResults(...args),
}))

vi.mock('@/lib/actions/riders', () => ({
  searchRiders: (...args: unknown[]) => mockSearchRiders(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const awards: AwardOption[] = [
  {
    id: 'a-pbp',
    slug: 'paris-brest-paris',
    title: 'Paris-Brest-Paris',
    award_type: 'result',
    description: null,
  },
  {
    id: 'a-sr',
    slug: 'super-randonneur',
    title: 'Super Randonneur',
    award_type: 'season',
    description: null,
  },
]

describe('AwardAssignForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssignResultAward.mockResolvedValue({ success: true })
    mockAssignSeasonAward.mockResolvedValue({ success: true })
    mockSearchRiders.mockResolvedValue([])
    mockSearchRiderResults.mockResolvedValue([])
  })

  it('shows only the award select before an award is picked', () => {
    render(<AwardAssignForm awards={awards} />)
    expect(screen.getByLabelText(/award/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/rider/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument()
  })

  it('reveals rider field when a result-scoped award is chosen', async () => {
    const user = userEvent.setup()
    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-pbp')

    expect(await screen.findByLabelText(/rider/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument()
  })

  it('reveals season + note when a season-scoped award is chosen', async () => {
    const user = userEvent.setup()
    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-sr')

    expect(await screen.findByLabelText(/rider/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/season/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/result/i)).not.toBeInTheDocument()
  })

  it('keeps the award selected and resets other fields after a successful season submit', async () => {
    const user = userEvent.setup()
    mockSearchRiders.mockResolvedValue([
      { id: 'rider-1', first_name: 'Jane', last_name: 'Doe', email: null },
    ])

    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-sr')
    await user.type(screen.getByPlaceholderText(/search.*rider/i), 'jane')

    await waitFor(() => expect(mockSearchRiders).toHaveBeenCalled())
    await user.click(await screen.findByText('Jane Doe'))

    const seasonInput = screen.getByLabelText(/season/i) as HTMLInputElement
    await user.clear(seasonInput)
    await user.type(seasonInput, '2024')

    await user.click(screen.getByRole('button', { name: /assign/i }))

    await waitFor(() => expect(mockAssignSeasonAward).toHaveBeenCalled())

    // Award still selected
    expect((screen.getByLabelText(/award/i) as HTMLSelectElement).value).toBe('a-sr')
    // Rider search reset
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })
})
