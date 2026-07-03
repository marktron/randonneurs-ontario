/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendResultRemindersButton } from '@/components/admin/send-result-reminders-button'
import { toast } from 'sonner'

const mockSendResultReminderEmails = vi.fn()

vi.mock('@/lib/actions/events', () => ({
  sendResultReminderEmails: (...args: unknown[]) => mockSendResultReminderEmails(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react')
  return {
    ...actual,
    Loader2: () => <span data-testid="icon-loader" />,
    Mail: () => <span data-testid="icon-mail" />,
  }
})

describe('SendResultRemindersButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is disabled when no riders have pending results', () => {
    render(<SendResultRemindersButton eventId="event-1" eventName="Test Brevet" pendingCount={0} />)

    const button = screen.getByRole('button', { name: /Send Reminders/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a confirmation with the recipient count before sending', async () => {
    const user = userEvent.setup()
    render(<SendResultRemindersButton eventId="event-1" eventName="Test Brevet" pendingCount={3} />)

    await user.click(screen.getByRole('button', { name: /Send Reminders/i }))

    expect(screen.getByText('Send Result Reminders?')).toBeTruthy()
    expect(screen.getByText(/3 riders/)).toBeTruthy()
    expect(mockSendResultReminderEmails).not.toHaveBeenCalled()
  })

  it('sends reminders on confirm and shows the sent count', async () => {
    const user = userEvent.setup()
    mockSendResultReminderEmails.mockResolvedValue({ success: true, data: { emailsSent: 3 } })

    render(<SendResultRemindersButton eventId="event-1" eventName="Test Brevet" pendingCount={3} />)

    await user.click(screen.getByRole('button', { name: /Send Reminders/i }))
    await user.click(screen.getByRole('button', { name: /^Send 3 Reminders$/i }))

    expect(mockSendResultReminderEmails).toHaveBeenCalledWith('event-1')
    expect(toast.success).toHaveBeenCalledWith('Sent 3 reminder emails')
  })

  it('shows an error toast when the action fails', async () => {
    const user = userEvent.setup()
    mockSendResultReminderEmails.mockResolvedValue({ success: false, error: 'SES exploded' })

    render(<SendResultRemindersButton eventId="event-1" eventName="Test Brevet" pendingCount={1} />)

    await user.click(screen.getByRole('button', { name: /Send Reminders/i }))
    await user.click(screen.getByRole('button', { name: /^Send 1 Reminder$/i }))

    expect(toast.error).toHaveBeenCalledWith('SES exploded')
  })
})
