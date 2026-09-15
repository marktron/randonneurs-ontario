import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// Mock logError before importing the module
const mockLogError = vi.fn()
vi.mock('@/lib/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

import { authorizeCronRequest } from '@/lib/cron-auth'

describe('authorizeCronRequest', () => {
  const CRON_SECRET = 'test-cron-secret'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
  })

  it('returns 500 when CRON_SECRET is not configured', () => {
    vi.stubEnv('CRON_SECRET', '')

    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const result = authorizeCronRequest(request, 'test-operation')

    expect(result).toBeInstanceOf(NextResponse)
    expect(result?.status).toBe(500)
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'test-operation.auth',
      })
    )
  })

  it('returns 401 when authorization header is incorrect', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const result = authorizeCronRequest(request, 'test-operation')

    expect(result).toBeInstanceOf(NextResponse)
    expect(result?.status).toBe(401)
  })

  it('returns null when authorization header is correct', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const result = authorizeCronRequest(request, 'test-operation')

    expect(result).toBeNull()
  })
})
