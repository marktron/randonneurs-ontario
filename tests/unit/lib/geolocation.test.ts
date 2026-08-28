import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HIGH_ACCURACY_TIMEOUT_MS,
  MAX_USABLE_LOCATION_ACCURACY_M,
  QUICK_LOCATION_TIMEOUT_MS,
  USEFUL_LOCATION_ACCURACY_M,
  acquireGeolocation,
} from '@/lib/geolocation'

function position(accuracy: number, latitude = 43.65, longitude = -79.38) {
  return {
    coords: { accuracy, latitude, longitude },
    timestamp: Date.now(),
  } as GeolocationPosition
}

function error(code: 1 | 2 | 3) {
  return {
    code,
    message: 'not persisted',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

describe('acquireGeolocation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a short, cached, low-accuracy request first and returns a useful fix', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(25)))
    const watchPosition = vi.fn()
    const clearWatch = vi.fn()

    const result = await acquireGeolocation({
      geolocation: { getCurrentPosition, watchPosition, clearWatch },
      context: 'browser',
    })

    expect(result).toMatchObject({
      ok: true,
      stage: 'quick',
      fix: { lat: 43.65, lng: -79.38, accuracyM: 25 },
    })
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: false,
      maximumAge: 30_000,
      timeout: QUICK_LOCATION_TIMEOUT_MS,
    })
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('keeps the best fix during the high-accuracy watch and resolves at the deadline', async () => {
    let watchSuccess!: PositionCallback
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(900)))
    const watchPosition = vi.fn((success: PositionCallback) => {
      watchSuccess = success
      return 17
    })
    const clearWatch = vi.fn()

    const pending = acquireGeolocation({
      geolocation: { getCurrentPosition, watchPosition, clearWatch },
      context: 'browser',
    })

    watchSuccess(position(450))
    watchSuccess(position(600))
    await vi.advanceTimersByTimeAsync(HIGH_ACCURACY_TIMEOUT_MS)

    await expect(pending).resolves.toMatchObject({
      ok: true,
      stage: 'high_accuracy',
      fix: { accuracyM: 450 },
    })
    expect(clearWatch).toHaveBeenCalledWith(17)
  })

  it('returns the coarse quick fix when the high-accuracy watch never yields a position', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(1_200))),
      watchPosition: vi.fn(() => 19),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'browser' })
    await vi.advanceTimersByTimeAsync(HIGH_ACCURACY_TIMEOUT_MS)

    await expect(pending).resolves.toMatchObject({
      ok: true,
      stage: 'high_accuracy',
      fix: { accuracyM: 1_200 },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(19)
  })

  it('keeps the coarse quick fix when starting the high-accuracy watch throws', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(1_200))),
      watchPosition: vi.fn(() => {
        throw new DOMException('Blocked by host app', 'NotAllowedError')
      }),
      clearWatch: vi.fn(),
    }

    await expect(acquireGeolocation({ geolocation, context: 'embedded' })).resolves.toMatchObject({
      ok: true,
      stage: 'high_accuracy',
      fix: { accuracyM: 1_200 },
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the coarse quick fix on a terminal high-accuracy request error', async () => {
    let watchError!: PositionErrorCallback
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(1_200))),
      watchPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback) => {
        watchError = onError!
        return 21
      }),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'embedded' })
    watchError({ code: 0, message: 'host failure' } as GeolocationPositionError)

    await expect(pending).resolves.toMatchObject({
      ok: true,
      stage: 'high_accuracy',
      fix: { accuracyM: 1_200 },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(21)
  })

  it('resolves early and clears the watch when high accuracy becomes useful', async () => {
    let watchSuccess!: PositionCallback
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(800))),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchSuccess = success
        return 23
      }),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'browser' })
    watchSuccess(position(USEFUL_LOCATION_ACCURACY_M))

    await expect(pending).resolves.toMatchObject({
      ok: true,
      stage: 'high_accuracy',
      fix: { accuracyM: USEFUL_LOCATION_ACCURACY_M },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(23)
  })

  it.each([2, 3] as const)(
    'does not fail early for geolocation error code %s during high accuracy',
    async (code) => {
      let watchError!: PositionErrorCallback
      const geolocation = {
        getCurrentPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback) =>
          onError?.(error(code))
        ),
        watchPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback) => {
          watchError = onError!
          return 31
        }),
        clearWatch: vi.fn(),
      }

      let settled = false
      const pending = acquireGeolocation({ geolocation, context: 'embedded' }).finally(() => {
        settled = true
      })
      watchError(error(code))
      await vi.advanceTimersByTimeAsync(HIGH_ACCURACY_TIMEOUT_MS - 1)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toMatchObject({
        ok: false,
        diagnostic: {
          reason: code === 2 ? 'position_unavailable' : 'timeout',
          stage: 'high_accuracy',
          elapsedMs: HIGH_ACCURACY_TIMEOUT_MS,
          context: 'embedded',
        },
      })
      expect(geolocation.clearWatch).toHaveBeenCalledWith(31)
    }
  )

  it('ends immediately on permission denial and cleans up the active watch', async () => {
    let watchError!: PositionErrorCallback
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(800))),
      watchPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback) => {
        watchError = onError!
        return 44
      }),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'standalone' })
    watchError(error(1))

    await expect(pending).resolves.toMatchObject({
      ok: false,
      diagnostic: {
        reason: 'permission_denied',
        stage: 'high_accuracy',
        context: 'standalone',
      },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(44)
  })

  it('ends on a quick-stage permission denial without starting a watch', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback) =>
        onError?.(error(1))
      ),
      watchPosition: vi.fn(() => 47),
      clearWatch: vi.fn(),
    }

    await expect(acquireGeolocation({ geolocation, context: 'browser' })).resolves.toMatchObject({
      ok: false,
      diagnostic: { reason: 'permission_denied', stage: 'quick', elapsedMs: 0 },
    })
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps synchronous request exceptions to request_error and clears the deadline', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn(() => {
        throw new DOMException('Blocked by host app', 'NotAllowedError')
      }),
      watchPosition: vi.fn(() => {
        throw new DOMException('Blocked by host app', 'NotAllowedError')
      }),
      clearWatch: vi.fn(),
    }

    await expect(acquireGeolocation({ geolocation, context: 'embedded' })).resolves.toMatchObject({
      ok: false,
      diagnostic: { reason: 'request_error', stage: 'high_accuracy', context: 'embedded' },
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports position_unavailable when every reading is too coarse to use', async () => {
    const coarse = position(MAX_USABLE_LOCATION_ACCURACY_M + 1)
    let watchSuccess!: PositionCallback
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(coarse)),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchSuccess = success
        return 49
      }),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'browser' })
    watchSuccess(coarse)
    await vi.advanceTimersByTimeAsync(HIGH_ACCURACY_TIMEOUT_MS)

    await expect(pending).resolves.toMatchObject({
      ok: false,
      diagnostic: { reason: 'position_unavailable', stage: 'high_accuracy' },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(49)
  })

  it.each([
    ['latitude outside the valid range', position(10, 91, -79.38)],
    ['longitude outside the valid range', position(10, 43.65, 181)],
  ])('reports request_error for a malformed position (%s)', async (_label, invalidPosition) => {
    let watchSuccess!: PositionCallback
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(invalidPosition)),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchSuccess = success
        return 49
      }),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({ geolocation, context: 'browser' })
    watchSuccess(invalidPosition)
    await vi.advanceTimersByTimeAsync(HIGH_ACCURACY_TIMEOUT_MS)

    await expect(pending).resolves.toMatchObject({
      ok: false,
      diagnostic: { reason: 'request_error', stage: 'high_accuracy' },
    })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(49)
  })

  it('aborts and clears timers and the watch', async () => {
    const controller = new AbortController()
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position(800))),
      watchPosition: vi.fn(() => 52),
      clearWatch: vi.fn(),
    }

    const pending = acquireGeolocation({
      geolocation,
      context: 'browser',
      signal: controller.signal,
    })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(geolocation.clearWatch).toHaveBeenCalledWith(52)
    expect(vi.getTimerCount()).toBe(0)
  })
})
