import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAnnounceNewAwards = vi.fn()
vi.mock('@/lib/awards/announce-awards', () => ({
  announceNewAwards: (...args: unknown[]) => mockAnnounceNewAwards(...args),
}))

const mockLogError = vi.fn()
vi.mock('@/lib/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

import { GET } from '@/app/api/cron/announce-awards/route'

const SECRET = 'test-cron-secret'

function request(token?: string) {
  return new Request('http://localhost/api/cron/announce-awards', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

describe('GET /api/cron/announce-awards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns 500 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(request(SECRET))
    expect(res.status).toBe(500)
    expect(mockAnnounceNewAwards).not.toHaveBeenCalled()
  })

  it('returns 401 for a bad token', async () => {
    const res = await GET(request('wrong'))
    expect(res.status).toBe(401)
    expect(mockAnnounceNewAwards).not.toHaveBeenCalled()
  })

  it('returns 200 with the sweep result', async () => {
    const result = { configured: true, fetched: 3, announced: 2, hiddenSkipped: 1, posted: 1 }
    mockAnnounceNewAwards.mockResolvedValueOnce(result)
    const res = await GET(request(SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, ...result })
  })

  it('returns 500 and logs when the sweep throws', async () => {
    mockAnnounceNewAwards.mockRejectedValueOnce(new Error('Slack webhook responded 500'))
    const res = await GET(request(SECRET))
    expect(res.status).toBe(500)
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'announce-awards' })
    )
  })
})
