import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/cache before imports
const revalidateTagMock = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}))

import { POST } from '@/app/api/revalidate/route'

const MOCK_SECRET = 'test-revalidate-secret'

function makeRequest(body: Record<string, unknown>, token?: string): Request {
  return new Request('http://localhost:3000/api/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('REVALIDATE_SECRET', MOCK_SECRET)
  })

  it('rejects requests without authorization header', async () => {
    const res = await POST(makeRequest({ tags: ['events'] }))
    expect(res.status).toBe(401)
  })

  it('rejects requests with wrong secret', async () => {
    const res = await POST(makeRequest({ tags: ['events'] }, 'wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 500 when REVALIDATE_SECRET is not configured', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '')
    const res = await POST(makeRequest({ tags: ['events'] }, MOCK_SECRET))
    expect(res.status).toBe(500)
  })

  it('revalidates specific tags', async () => {
    const res = await POST(makeRequest({ tags: ['events', 'results'] }, MOCK_SECRET))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.revalidated).toEqual(['events', 'results'])
    expect(revalidateTagMock).toHaveBeenCalledTimes(2)
    expect(revalidateTagMock).toHaveBeenCalledWith('events', 'max')
    expect(revalidateTagMock).toHaveBeenCalledWith('results', 'max')
  })

  it('revalidates all tags when all: true', async () => {
    const res = await POST(makeRequest({ all: true }, MOCK_SECRET))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.revalidated).toContain('events')
    expect(json.revalidated).toContain('registrations')
    expect(json.revalidated).toContain('results')
    expect(json.revalidated).toContain('riders')
    expect(json.revalidated).toContain('records')
    expect(json.revalidated).toContain('routes')
    expect(json.revalidated).toContain('news')
    expect(json.revalidated).toContain('permanents')
    expect(json.revalidated).toContain('chapters')
    expect(json.revalidated).toContain('slugs')
  })

  it('rejects unknown tags', async () => {
    const res = await POST(makeRequest({ tags: ['events', 'bogus'] }, MOCK_SECRET))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toMatch(/invalid tags/i)
    expect(json.invalidTags).toEqual(['bogus'])
  })

  it('rejects request with neither tags nor all', async () => {
    const res = await POST(makeRequest({}, MOCK_SECRET))
    expect(res.status).toBe(400)
  })

  it('rejects empty tags array', async () => {
    const res = await POST(makeRequest({ tags: [] }, MOCK_SECRET))
    expect(res.status).toBe(400)
  })
})
