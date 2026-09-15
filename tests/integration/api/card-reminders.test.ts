import { describe, it, expect, vi, beforeEach } from 'vitest'

// Model on complete-events.test.ts, but the sweep has its own unit tests
// (tests/unit/lib/events/send-card-reminders.test.ts, if present), so this
// route test mocks it wholesale instead of any Supabase-level machinery.
const mockSendCardReminders = vi.fn()
vi.mock('@/lib/events/send-card-reminders', () => ({
  sendCardReminders: (...args: unknown[]) => mockSendCardReminders(...args),
}))

const mockLogError = vi.fn()
vi.mock('@/lib/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

// Import the route handler after mocking
import { GET } from '@/app/api/cron/card-reminders/route'

describe('card-reminders cron endpoint', () => {
  const CRON_SECRET = 'test-cron-secret'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const request = new Request('http://localhost/api/cron/card-reminders', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error).toBe('Server configuration error')
    expect(mockSendCardReminders).not.toHaveBeenCalled()
  })

  it('returns 401 when the bearer token is wrong', async () => {
    const request = new Request('http://localhost/api/cron/card-reminders', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const response = await GET(request)

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.error).toBe('Unauthorized')
    expect(mockSendCardReminders).not.toHaveBeenCalled()
  })

  it('returns 200 with the sweep result spread when authorized', async () => {
    mockSendCardReminders.mockResolvedValue({
      checked: 3,
      sent: 2,
      skipped: { notInWindow: 0, lateSignup: 0, noControls: 0, noEmail: 1, alreadyClaimed: 0 },
      errors: [],
    })

    const request = new Request('http://localhost/api/cron/card-reminders', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({
      success: true,
      checked: 3,
      sent: 2,
      skipped: { notInWindow: 0, lateSignup: 0, noControls: 0, noEmail: 1, alreadyClaimed: 0 },
      errors: undefined,
    })
    expect(mockSendCardReminders).toHaveBeenCalledTimes(1)
  })

  it('includes errors in the response when the sweep reports them', async () => {
    mockSendCardReminders.mockResolvedValue({
      checked: 1,
      sent: 0,
      skipped: { notInWindow: 0, lateSignup: 0, noControls: 0, noEmail: 0, alreadyClaimed: 0 },
      errors: ['Failed to send card reminder to Jane Doe for Test Brevet: boom'],
    })

    const request = new Request('http://localhost/api/cron/card-reminders', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.errors).toEqual(['Failed to send card reminder to Jane Doe for Test Brevet: boom'])
  })

  it('returns 500 when the sweep throws', async () => {
    mockSendCardReminders.mockRejectedValue(new Error('boom'))

    const request = new Request('http://localhost/api/cron/card-reminders', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const response = await GET(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error).toBe('Internal server error')
    expect(mockLogError).toHaveBeenCalledWith(expect.any(Error), { operation: 'card-reminders' })
  })
})
