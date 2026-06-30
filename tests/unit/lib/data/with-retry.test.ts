import { describe, it, expect, vi } from 'vitest'
import { queryWithRetry } from '@/lib/data/with-retry'

// No real delays in tests.
const noDelay = { delayMs: () => 0 }

describe('queryWithRetry', () => {
  it('returns immediately on success without retrying', async () => {
    const run = vi.fn().mockResolvedValue({ data: [1, 2], error: null, status: 200 })

    const result = await queryWithRetry(run, noDelay)

    expect(result.data).toEqual([1, 2])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries a transient 5xx failure and returns the recovered result', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Internal server error.' },
        status: 500,
      })
      .mockResolvedValueOnce({ data: ['ok'], error: null, status: 200 })

    const result = await queryWithRetry(run, noDelay)

    expect(result.error).toBeNull()
    expect(result.data).toEqual(['ok'])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('gives up after the configured number of attempts on a persistent 5xx', async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'Internal server error.' }, status: 503 })

    const result = await queryWithRetry(run, { attempts: 3, delayMs: () => 0 })

    expect(result.error).not.toBeNull()
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry a 4xx error (client errors are not transient)', async () => {
    const run = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { message: 'Bad Request', code: '22007' },
        status: 400,
      })

    const result = await queryWithRetry(run, noDelay)

    expect(result.error).not.toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry an error with no status (conservative — avoids masking real bugs)', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { message: 'No events returned' } })

    await queryWithRetry(run, noDelay)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries a thrown transport/network error then succeeds', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ data: ['ok'], error: null, status: 200 })

    const result = await queryWithRetry(run, noDelay)

    expect(result.data).toEqual(['ok'])
    expect(run).toHaveBeenCalledTimes(2)
  })
})
