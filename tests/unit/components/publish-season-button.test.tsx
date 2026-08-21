/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublishSeasonButton } from '@/components/admin/publish-season-button'

const mockPublish = vi.fn()
vi.mock('@/lib/actions/events', () => ({
  publishSeasonDrafts: (...args: unknown[]) => mockPublish(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const counts = [
  { chapterName: 'Toronto', count: 12 },
  { chapterName: 'Ottawa', count: 3 },
]

describe('PublishSeasonButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublish.mockResolvedValue({ success: true, data: { published: 15, erwFailures: 0 } })
  })

  it('renders nothing when there are no drafts', () => {
    const { container } = render(<PublishSeasonButton season={2027} draftCounts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the season and total draft count', () => {
    render(<PublishSeasonButton season={2027} draftCounts={counts} />)
    expect(
      screen.getByRole('button', { name: /publish 2027 season \(15 drafts\)/i })
    ).toBeInTheDocument()
  })

  it('lists per-chapter counts in the confirm dialog and publishes on confirm', async () => {
    const user = userEvent.setup()
    render(<PublishSeasonButton season={2027} draftCounts={counts} />)

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Toronto')
    expect(dialog).toHaveTextContent('12')
    expect(dialog).toHaveTextContent('Ottawa')
    expect(dialog).toHaveTextContent('3')

    await user.click(screen.getByRole('button', { name: /^publish 15 events$/i }))

    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(2027))
    const { toast } = await import('sonner')
    expect(toast.success).toHaveBeenCalledWith('Published 15 events for the 2027 season')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('warns when some ERW syncs failed', async () => {
    mockPublish.mockResolvedValue({ success: true, data: { published: 15, erwFailures: 2 } })
    const user = userEvent.setup()
    render(<PublishSeasonButton season={2027} draftCounts={counts} />)

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    await user.click(await screen.findByRole('button', { name: /^publish 15 events$/i }))

    const { toast } = await import('sonner')
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Published 15 events; 2 could not be synced to Epic Ride Weather'
      )
    )
  })

  it('shows the action error on failure', async () => {
    mockPublish.mockResolvedValue({
      success: false,
      error: 'Only super admins can publish a season',
    })
    const user = userEvent.setup()
    render(<PublishSeasonButton season={2027} draftCounts={counts} />)

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    await user.click(await screen.findByRole('button', { name: /^publish 15 events$/i }))

    const { toast } = await import('sonner')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Only super admins can publish a season')
    )
  })
})
