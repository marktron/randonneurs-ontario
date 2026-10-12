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

const CHAPTER_ID = 'chapter-toronto'

const events = [
  { id: 'e1', name: 'Season Opener 200', eventDate: '2026-11-14' },
  { id: 'e2', name: 'Spring 300', eventDate: '2027-04-24' },
]

function renderButton(overrides: Partial<Parameters<typeof PublishSeasonButton>[0]> = {}) {
  return render(
    <PublishSeasonButton
      acpSeason={2027}
      chapterId={CHAPTER_ID}
      chapterName="Toronto"
      events={events}
      {...overrides}
    />
  )
}

describe('PublishSeasonButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublish.mockResolvedValue({ success: true, data: { published: 2, erwFailures: 0 } })
  })

  it('renders nothing when there are no drafts', () => {
    const { container } = renderButton({ events: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the ACP season and draft count', () => {
    renderButton()
    expect(
      screen.getByRole('button', { name: /publish 2027 season \(2 drafts\)/i })
    ).toBeInTheDocument()
  })

  it('uses the singular for one draft', () => {
    renderButton({ events: [events[0]] })
    expect(
      screen.getByRole('button', { name: /publish 2027 season \(1 draft\)/i })
    ).toBeInTheDocument()
  })

  it('names the chapter, the window, and each event in the dialog, and publishes on confirm', async () => {
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Publish the 2027 season for Toronto?')
    expect(dialog).toHaveTextContent('Nov 1, 2026 to Oct 31, 2027')
    expect(dialog).toHaveTextContent('Season Opener 200')
    expect(dialog).toHaveTextContent('November 14, 2026')
    expect(dialog).toHaveTextContent('Spring 300')
    expect(dialog).toHaveTextContent('April 24, 2027')

    await user.click(screen.getByRole('button', { name: /^publish 2 events$/i }))

    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(2027, CHAPTER_ID))
    const { toast } = await import('sonner')
    expect(toast.success).toHaveBeenCalledWith('Published 2 events for the 2027 season')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('warns when some ERW syncs failed', async () => {
    mockPublish.mockResolvedValue({ success: true, data: { published: 2, erwFailures: 1 } })
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    await user.click(await screen.findByRole('button', { name: /^publish 2 events$/i }))

    const { toast } = await import('sonner')
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Published 2 events; 1 could not be synced to Epic Ride Weather'
      )
    )
  })

  it('shows the action error on failure', async () => {
    mockPublish.mockResolvedValue({
      success: false,
      error: 'You can only publish your own chapter',
    })
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByRole('button', { name: /publish 2027 season/i }))
    await user.click(await screen.findByRole('button', { name: /^publish 2 events$/i }))

    const { toast } = await import('sonner')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You can only publish your own chapter')
    )
  })
})
