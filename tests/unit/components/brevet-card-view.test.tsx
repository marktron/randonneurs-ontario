/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrevetCard } from '@/components/brevet-card-view'
import type { BrevetCardData } from '@/lib/actions/brevet-card'
import { checkInAtControl, undoCheckin } from '@/lib/actions/brevet-card'

vi.mock('@/lib/actions/brevet-card', () => ({
  checkInAtControl: vi.fn(),
  undoCheckin: vi.fn(),
}))

const mockCheckIn = vi.mocked(checkInAtControl)
const mockUndo = vi.mocked(undoCheckin)

const NO_FLAGS = { outOfRadius: false, noGps: false, early: false, late: false, lateSync: false }

/** Successful check-in response echoing the given control id. */
function checkinOk(
  controlId: string,
  method = 'gps'
): Awaited<ReturnType<typeof checkInAtControl>> {
  return {
    success: true,
    data: {
      checkin: {
        controlId,
        checkedInAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        method,
        distanceToControlM: method === 'gps' ? 12 : null,
        flags: { ...NO_FLAGS, noGps: method === 'manual' },
      },
      alreadyExisted: false,
    },
  } as Awaited<ReturnType<typeof checkInAtControl>>
}

/**
 * Two controls with coordinates ~5.6 km apart, both open (their windows are
 * in the past), so wrong-control detection can fire without the early confirm.
 */
function makeTwoControlData(): BrevetCardData {
  const data = makeData()
  const openPast = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const closeFuture = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
  data.controls = [
    {
      id: 'ctrl-a',
      position: 1,
      name: 'Exeter',
      distanceKm: 50,
      lat: 43.65,
      lng: -79.38,
      radiusM: 500,
      notes: null,
      opensAt: openPast,
      closesAt: closeFuture,
      legName: null,
    },
    {
      id: 'ctrl-b',
      position: 2,
      name: 'Ilderton',
      distanceKm: 100,
      lat: 43.7,
      lng: -79.38,
      radiusM: 500,
      notes: null,
      opensAt: openPast,
      closesAt: closeFuture,
      legName: null,
    },
  ]
  return data
}

/** One control whose window opens two hours from now (early check-in). */
function makeNotOpenData(): BrevetCardData {
  const data = makeData()
  const openFuture = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const closeFuture = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
  data.controls = [
    {
      id: 'ctrl-1',
      position: 1,
      name: 'Exeter',
      distanceKm: 50,
      lat: 43.65,
      lng: -79.38,
      radiusM: 500,
      notes: null,
      opensAt: openFuture,
      closesAt: closeFuture,
      legName: null,
    },
  ]
  return data
}

/** One first control (0 km) on an event starting 30 minutes from now. */
function makePreStartData(): BrevetCardData {
  const data = makeData()
  const startsAt = new Date(Date.now() + 30 * 60 * 1000)
  data.event.startsAt = startsAt.toISOString()
  data.controls = [
    {
      id: 'ctrl-1',
      position: 1,
      name: 'Start',
      distanceKm: 0,
      lat: 43.65,
      lng: -79.38,
      radiusM: 500,
      notes: null,
      opensAt: startsAt.toISOString(),
      closesAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
      legName: null,
    },
  ]
  return data
}

const TOKEN = 'test-token'

function makeData(): BrevetCardData {
  // Started an hour ago so the check-in window is open.
  const startsAt = new Date(Date.now() - 60 * 60 * 1000)
  return {
    registration: { id: 'reg-1', status: 'registered', isPreRide: false },
    event: {
      id: 'evt-1',
      slug: 'test-200',
      name: 'Test 200',
      status: 'scheduled',
      eventType: 'brevet',
      eventDate: startsAt.toISOString().slice(0, 10),
      startTime: '08:00',
      distanceKm: 200,
      chapterName: 'Toronto',
      startsAt: startsAt.toISOString(),
      organizer: { name: null, phone: null, email: null },
      rwgpsId: null,
    },
    rider: { firstName: 'Ada', lastName: 'Lovelace' },
    controls: [
      {
        id: 'ctrl-1',
        position: 1,
        name: 'Start',
        distanceKm: 0,
        lat: 43.65,
        lng: -79.38,
        radiusM: 500,
        notes: null,
        opensAt: startsAt.toISOString(),
        closesAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
        legName: null,
      },
    ],
    checkins: [],
  }
}

/** Geolocation stub that reports a fix asynchronously, like a real device. */
function stubGeolocation(lat = 43.65, lng = -79.38) {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    setTimeout(() => {
      success({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 10,
        },
      } as GeolocationPosition)
    }, 0)
  })
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
}

/**
 * Geolocation stub whose first `failures` calls report the given error
 * code asynchronously, then succeed with a fix (like a rider fixing
 * settings and retrying).
 */
function stubGeolocationError(code: number, failures = Infinity, lat = 43.65, lng = -79.38) {
  let calls = 0
  const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback) => {
    calls += 1
    const failing = calls <= failures
    setTimeout(() => {
      if (failing) {
        error?.({
          code,
          message: 'stubbed error',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError)
      } else {
        success({ coords: { latitude: lat, longitude: lng, accuracy: 10 } } as GeolocationPosition)
      }
    }, 0)
  })
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
  return { getCurrentPosition }
}

/**
 * navigator.permissions stub. Returns a controller whose setState() flips
 * the permission state and fires the 'change' listeners, like a rider
 * changing OS settings while the page is open.
 */
function stubPermissions(state: PermissionState) {
  const listeners = new Set<() => void>()
  const status = {
    state,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  }
  const query = vi.fn().mockResolvedValue(status)
  Object.defineProperty(navigator, 'permissions', {
    value: { query },
    configurable: true,
  })
  return {
    query,
    setState(next: PermissionState) {
      ;(status as { state: PermissionState }).state = next
      listeners.forEach((cb) => cb())
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  stubGeolocation()
  // undoCheckin is fire-and-forget in the pending path (.catch on the result),
  // so it must resolve a promise even when a test doesn't assert on it.
  mockUndo.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof undoCheckin>>)
  // happy-dom leaves isSecureContext undefined; real browsers always set it.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  // Default: Permissions API absent (like older Safari) so unrelated tests
  // exercise the API-unavailable path without stubbing.
  Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
})

describe('BrevetCard header', () => {
  it('renders the rider name prominently in a dedicated line', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    expect(screen.getByText(/brevet card for/i)).toBeInTheDocument()
    expect(
      screen.getByText((content) => content.includes('Ada') && content.includes('Lovelace'))
    ).toBeInTheDocument()
  })

  it('does not include the rider name in the metadata line', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    const metadataLine = screen.getByText(/km · .* start/i)
    expect(metadataLine).not.toHaveTextContent('Ada')
    expect(metadataLine).not.toHaveTextContent('Lovelace')
  })
})

describe('BrevetCard check-in sync', () => {
  it('sends the check-in to the server immediately after tapping Check in', async () => {
    mockCheckIn.mockResolvedValue({
      success: true,
      data: {
        checkin: {
          controlId: 'ctrl-1',
          checkedInAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          method: 'gps',
          distanceToControlM: 12,
          flags: { outOfRadius: false, noGps: false, early: false, late: false, lateSync: false },
        },
      },
    } as Awaited<ReturnType<typeof checkInAtControl>>)

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /check in/i }))

    // The tap must trigger an immediate sync attempt — not wait for the
    // 45-second outbox retry interval.
    await waitFor(
      () => {
        expect(mockCheckIn).toHaveBeenCalledWith(
          TOKEN,
          expect.objectContaining({ controlId: 'ctrl-1' })
        )
      },
      { timeout: 2000 }
    )

    // And the row should flip from "Waiting to sync" to a confirmed time.
    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
    })
  })

  it('keeps the check-in queued when the network is down', async () => {
    mockCheckIn.mockRejectedValue(new Error('network down'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /check in/i }))

    await waitFor(() => {
      expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
    })
    expect(JSON.parse(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`) ?? '[]')).toEqual([
      expect.objectContaining({ controlId: 'ctrl-1' }),
    ])
  })

  it('keeps a retryable rejection queued and syncs it on a later flush', async () => {
    // A rate-limited sync is transient — the tap must not be dropped.
    mockCheckIn.mockResolvedValueOnce({
      success: false,
      error: 'Too many check-in attempts. Please wait a few minutes.',
      retryable: true,
    } as Awaited<ReturnType<typeof checkInAtControl>>)

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /check in/i }))

    await waitFor(() => {
      expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
    })
    // Transient failures are not surfaced as a rejection banner.
    expect(screen.queryByText(/too many check-in attempts/i)).not.toBeInTheDocument()

    // Later the limiter clears; connectivity events retrigger a flush.
    mockCheckIn.mockResolvedValue({
      success: true,
      data: {
        checkin: {
          controlId: 'ctrl-1',
          checkedInAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          method: 'gps',
          distanceToControlM: 12,
          flags: { outOfRadius: false, noGps: false, early: false, late: false, lateSync: false },
        },
      },
    } as Awaited<ReturnType<typeof checkInAtControl>>)

    fireEvent(window, new Event('online'))

    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
    })
    expect(mockCheckIn).toHaveBeenCalledTimes(2)
  })

  it('drops a permanently rejected check-in and shows the error', async () => {
    mockCheckIn.mockResolvedValue({
      success: false,
      error: 'This event has been cancelled',
    } as Awaited<ReturnType<typeof checkInAtControl>>)

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /check in/i }))

    await waitFor(() => {
      expect(screen.getByText(/this event has been cancelled/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`)).toBeNull()
  })

  it('syncs a pre-existing localStorage outbox on mount (recovery path)', async () => {
    // A check-in queued on a previous page load is still waiting to sync.
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([{ controlId: 'ctrl-1', checkedInAt: new Date().toISOString() }])
    )
    mockCheckIn.mockResolvedValue({
      success: true,
      data: {
        checkin: {
          controlId: 'ctrl-1',
          checkedInAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          method: 'manual',
          distanceToControlM: null,
          flags: { outOfRadius: false, noGps: true, early: false, late: false, lateSync: false },
        },
      },
    } as Awaited<ReturnType<typeof checkInAtControl>>)

    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-1' })
      )
    })
    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
    })
  })

  it.each([
    ['null accuracy', null],
    ['accuracy above the current server bound', 100_001],
  ])('recovers a legacy GPS outbox entry with %s', async (_label, accuracyM) => {
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([
        {
          controlId: 'ctrl-1',
          checkedInAt: new Date().toISOString(),
          lat: 43.65,
          lng: -79.38,
          accuracyM,
        },
      ])
    )
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(1))
    expect(mockCheckIn).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ controlId: 'ctrl-1', lat: 43.65, lng: -79.38 })
    )
    expect(mockCheckIn.mock.calls[0][1]).not.toHaveProperty('accuracyM')
    await waitFor(() => {
      expect(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`)).toBeNull()
    })
  })

  it('still syncs immediately when localStorage writes are blocked', async () => {
    // Private mode / quota exceeded: setItem throws. The tap must still
    // reach the server from in-memory state.
    const originalStorage = window.localStorage
    const blockedStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
      getItem: (key) => originalStorage.getItem(key),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: (key) => originalStorage.removeItem(key),
      clear: () => originalStorage.clear(),
    }
    Object.defineProperty(window, 'localStorage', { value: blockedStorage, configurable: true })
    try {
      // Sanity: the stub actually blocks writes in this environment.
      expect(() => window.localStorage.setItem('probe', 'x')).toThrow()
      mockCheckIn.mockResolvedValue({
        success: true,
        data: {
          checkin: {
            controlId: 'ctrl-1',
            checkedInAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            method: 'gps',
            distanceToControlM: 12,
            flags: { outOfRadius: false, noGps: false, early: false, late: false, lateSync: false },
          },
        },
      } as Awaited<ReturnType<typeof checkInAtControl>>)

      const user = userEvent.setup()
      render(<BrevetCard token={TOKEN} initialData={makeData()} />)

      await user.click(screen.getByRole('button', { name: /check in/i }))

      await waitFor(() => {
        expect(mockCheckIn).toHaveBeenCalledWith(
          TOKEN,
          expect.objectContaining({ controlId: 'ctrl-1' })
        )
      })
      await waitFor(() => {
        expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
      })
    } finally {
      Object.defineProperty(window, 'localStorage', {
        value: originalStorage,
        configurable: true,
      })
    }
  })
})

describe('BrevetCard geolocation hard failures', () => {
  it('explains that HTTP blocks location when the context is not secure', async () => {
    // http:// on a non-localhost host (e.g. testing from a phone over a
    // LAN/Tailscale IP): browsers disable geolocation entirely. Skip the
    // doomed lookup and say why.
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    try {
      const user = userEvent.setup()
      render(<BrevetCard token={TOKEN} initialData={makeData()} />)

      await user.click(screen.getByRole('button', { name: /check in/i }))

      expect(await screen.findByRole('alertdialog')).toHaveTextContent(
        /secure \(https\) connection/i
      )
      expect(navigator.geolocation?.getCurrentPosition).not.toHaveBeenCalled?.()
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    }
  })

  it('falls back to the manual dialog when getCurrentPosition throws synchronously', async () => {
    // Permissions-Policy blocks and some embedded webviews throw instead of
    // invoking the error callback. Without a catch, the spinner sticks
    // forever and the tap appears to do nothing.
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: () => {
          throw new DOMException('Geolocation disabled by permissions policy', 'NotAllowedError')
        },
      },
      configurable: true,
    })

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /check in/i }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/check in without gps/i)
    // The locating spinner must not be stuck on the button.
    expect(screen.getByRole('button', { name: /check in/i })).toBeEnabled()
  })
})

describe('BrevetCard permission-denied help', () => {
  it('shows the blocked-location dialog with fix steps when permission is denied', async () => {
    stubGeolocationError(1)

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/location is blocked/i)
    // happy-dom's UA maps to the generic platform copy.
    expect(dialog).toHaveTextContent(/allow location for this site/i)
    expect(within(dialog).getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /check in without gps/i })
    ).toBeInTheDocument()
    // Nothing recorded until the rider chooses.
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it('Try again retries the lookup and records a GPS check-in when it succeeds', async () => {
    // First lookup: denied. Second (after the rider fixes settings): a fix.
    stubGeolocationError(1, 1)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-1', lat: expect.any(Number) })
      )
    })
  })

  it('Check in without GPS records a manual check-in from the blocked dialog', async () => {
    stubGeolocationError(1)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1', 'manual'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /check in without gps/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.not.objectContaining({ lat: expect.anything() })
      )
    })
    expect(mockCheckIn).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ controlId: 'ctrl-1' })
    )
  })

  it('keeps the generic no-GPS dialog for position-unavailable and timeout', async () => {
    vi.useFakeTimers()
    try {
      for (const code of [2, 3]) {
        stubGeolocationError(code)

        const { unmount } = render(<BrevetCard token={TOKEN} initialData={makeData()} />)

        fireEvent.click(screen.getByRole('button', { name: /^check in$/i }))

        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(screen.getByText(/waiting for precise gps/i)).toBeInTheDocument()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(45_000)
        })

        const dialog = screen.getByRole('alertdialog')
        expect(dialog).toHaveTextContent(/check in without gps/i)
        expect(dialog).not.toHaveTextContent(/location is blocked/i)
        unmount()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('a tap-time denial clears a stale success note and shows the blocked banner', async () => {
    // Rider tested location successfully earlier (locationStatus 'granted'),
    // then loses permission at the OS level with no 'change' event firing.
    // Tapping Check in should surface the same banner-state sync that the
    // test-button code-1 branch already performs.
    stubPermissions('prompt')
    stubGeolocation()
    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(await screen.findByRole('button', { name: /test your location/i }))
    await screen.findByText(/location works on this phone/i)

    stubGeolocationError(1)
    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByText(/location works on this phone/i)).toBeNull()
    expect(await screen.findByText(/location is blocked for this browser/i)).toBeInTheDocument()
  })
})

describe('BrevetCard location diagnostics and GPS retry', () => {
  function dataWithFreshManualCheckin(): BrevetCardData {
    const data = makeData()
    const receivedAt = new Date(Date.now() - 60_000).toISOString()
    data.checkins = [
      {
        controlId: 'ctrl-1',
        checkedInAt: receivedAt,
        receivedAt,
        method: 'manual',
        distanceToControlM: null,
        flags: { ...NO_FLAGS, noGps: true },
      },
    ]
    return data
  }

  it('preserves tap time and sends bounded diagnostics after the full GPS wait', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T16:00:00Z'))
    const data = makeData()
    const tappedAt = new Date().toISOString()
    stubGeolocationError(3)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1', 'manual'))
    const { unmount } = render(<BrevetCard token={TOKEN} initialData={data} />)

    try {
      fireEvent.click(screen.getByRole('button', { name: /^check in$/i }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000)
      })

      const dialog = screen.getByRole('alertdialog')
      fireEvent.click(within(dialog).getByRole('button', { name: /check in anyway/i }))

      expect(mockCheckIn).toHaveBeenCalledWith(TOKEN, {
        controlId: 'ctrl-1',
        checkedInAt: tappedAt,
        locationFailure: {
          reason: 'timeout',
          stage: 'high_accuracy',
          elapsedMs: 45_000,
          context: 'browser',
        },
      })
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('upgrades a recent manual check-in with GPS while preserving its original time', async () => {
    const data = dataWithFreshManualCheckin()
    const originalCheckedInAt = data.checkins[0].checkedInAt
    mockCheckIn.mockResolvedValue({
      success: true,
      data: {
        checkin: {
          controlId: 'ctrl-1',
          checkedInAt: originalCheckedInAt,
          receivedAt: new Date().toISOString(),
          method: 'gps',
          distanceToControlM: 12,
          flags: { ...NO_FLAGS },
        },
        alreadyExisted: true,
        upgradedFromManual: true,
      },
    })

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)

    await user.click(await screen.findByRole('button', { name: /retry gps/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({
          controlId: 'ctrl-1',
          checkedInAt: originalCheckedInAt,
          lat: 43.65,
          lng: -79.38,
          accuracyM: 10,
          expectedManualReceivedAt: data.checkins[0].receivedAt,
        })
      )
    })
    expect(await screen.findByText(/gps was added to your saved check-in/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry gps/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/gps was added to your saved check-in/i)).not.toBeInTheDocument()
  })

  it('explains when a late GPS retry cannot replace the saved manual evidence', async () => {
    const data = dataWithFreshManualCheckin()
    mockCheckIn.mockResolvedValue({
      success: true,
      data: {
        checkin: data.checkins[0],
        alreadyExisted: true,
        upgradedFromManual: false,
      },
    })

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)
    await user.click(await screen.findByRole('button', { name: /retry gps/i }))

    expect(
      await screen.findByText(/gps could not replace the saved manual check-in/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry gps/i })).toBeInTheDocument()
  })

  it('disables Undo while a GPS retry is still acquiring a precise fix', async () => {
    const data = dataWithFreshManualCheckin()
    const clearWatch = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(
            () =>
              success({
                coords: { latitude: 43.65, longitude: -79.38, accuracy: 1_000 },
              } as GeolocationPosition),
            0
          )
        },
        watchPosition: vi.fn(() => 71),
        clearWatch,
      },
      configurable: true,
    })

    const user = userEvent.setup()
    const { unmount } = render(<BrevetCard token={TOKEN} initialData={data} />)
    await user.click(await screen.findByRole('button', { name: /retry gps/i }))

    expect(await screen.findByText(/waiting for precise gps/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeDisabled()

    unmount()
    expect(clearWatch).toHaveBeenCalledWith(71)
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it('does not resurrect a manual check-in undone while its GPS upgrade is syncing', async () => {
    const data = dataWithFreshManualCheckin()
    let resolveUpgrade!: (value: Awaited<ReturnType<typeof checkInAtControl>>) => void
    mockCheckIn.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof checkInAtControl>>>((resolve) => {
          resolveUpgrade = resolve
        })
    )

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)
    await user.click(await screen.findByRole('button', { name: /retry gps/i }))

    await screen.findByText(/gps fix saved — waiting to sync/i)
    expect(screen.getByRole('button', { name: /gps queued/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^undo$/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    })
    expect(mockUndo).toHaveBeenCalledTimes(1)

    resolveUpgrade({
      success: true,
      data: {
        checkin: {
          controlId: 'ctrl-1',
          checkedInAt: data.checkins[0].checkedInAt,
          receivedAt: new Date().toISOString(),
          method: 'gps',
          distanceToControlM: 12,
          flags: { ...NO_FLAGS },
        },
        alreadyExisted: true,
        upgradedFromManual: true,
      },
    })

    await waitFor(() => expect(mockUndo).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    expect(screen.queryByText(/gps was added/i)).not.toBeInTheDocument()
  })

  it('does not let a stale recovered acknowledgement delete a newer GPS retry', async () => {
    const data = dataWithFreshManualCheckin()
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([
        {
          controlId: 'ctrl-1',
          checkedInAt: data.checkins[0].checkedInAt,
          locationFailure: {
            reason: 'timeout',
            stage: 'high_accuracy',
            elapsedMs: 45_000,
            context: 'browser',
          },
        },
      ])
    )

    let resolveRecovered!: (value: Awaited<ReturnType<typeof checkInAtControl>>) => void
    mockCheckIn
      .mockImplementationOnce(
        () =>
          new Promise<Awaited<ReturnType<typeof checkInAtControl>>>((resolve) => {
            resolveRecovered = resolve
          })
      )
      .mockResolvedValueOnce({
        success: true,
        data: {
          checkin: {
            ...data.checkins[0],
            method: 'gps',
            distanceToControlM: 12,
            flags: { ...NO_FLAGS },
          },
          alreadyExisted: true,
          upgradedFromManual: true,
        },
      })

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /retry gps/i }))
    expect(await screen.findByText(/gps fix saved — waiting to sync/i)).toBeInTheDocument()

    resolveRecovered({
      success: true,
      data: {
        checkin: data.checkins[0],
        alreadyExisted: true,
        upgradedFromManual: false,
      },
    })

    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(2))
    expect(mockCheckIn.mock.calls[1][1]).toMatchObject({
      controlId: 'ctrl-1',
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: data.checkins[0].receivedAt,
    })
    expect(await screen.findByText(/gps was added to your saved check-in/i)).toBeInTheDocument()
    expect(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`)).toBeNull()
  })

  it('uses a check-in that syncs while another control is waiting for GPS', async () => {
    const data = makeTwoControlData()
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([{ controlId: 'ctrl-a', checkedInAt: new Date().toISOString() }])
    )
    let resolveRecovered!: (value: Awaited<ReturnType<typeof checkInAtControl>>) => void
    mockCheckIn.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof checkInAtControl>>>((resolve) => {
          resolveRecovered = resolve
        })
    )

    let watchSuccess!: PositionCallback
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 43.65, longitude: -79.38, accuracy: 1_000 },
          } as GeolocationPosition),
        watchPosition: vi.fn((success: PositionCallback) => {
          watchSuccess = success
          return 81
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    })

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    expect(await screen.findByText(/waiting for precise gps/i)).toBeInTheDocument()

    await act(async () => resolveRecovered(checkinOk('ctrl-a')))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^undo$/i })).toBeInTheDocument()
    })

    act(() => {
      watchSuccess({
        coords: { latitude: 43.65, longitude: -79.38, accuracy: 10 },
      } as GeolocationPosition)
    })

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/already checked into/i)
    expect(dialog).not.toHaveTextContent(/check in at exeter$/i)
  })

  it("does not cancel another control's active GPS lookup when undoing a saved check-in", async () => {
    const data = makeTwoControlData()
    const receivedAt = new Date(Date.now() - 60_000).toISOString()
    data.checkins = [
      {
        controlId: 'ctrl-a',
        checkedInAt: receivedAt,
        receivedAt,
        method: 'manual',
        distanceToControlM: null,
        flags: { ...NO_FLAGS, noGps: true },
      },
    ]

    const clearWatch = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(
            () =>
              success({
                coords: { latitude: 43.7, longitude: -79.38, accuracy: 1_000 },
              } as GeolocationPosition),
            0
          )
        },
        watchPosition: vi.fn(() => 73),
        clearWatch,
      },
      configurable: true,
    })

    const user = userEvent.setup()
    const { unmount } = render(<BrevetCard token={TOKEN} initialData={data} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    expect(await screen.findByText(/waiting for precise gps/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    await waitFor(() => {
      expect(mockUndo).toHaveBeenCalledWith(TOKEN, { controlId: 'ctrl-a' })
    })

    expect(clearWatch).not.toHaveBeenCalled()
    expect(screen.getByText(/waiting for precise gps/i)).toBeInTheDocument()

    unmount()
    expect(clearWatch).toHaveBeenCalledWith(73)
  })

  it('blocks a second control tap while one control is still acquiring GPS', async () => {
    const data = makeTwoControlData()
    let watchSuccess!: PositionCallback
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 43.65, longitude: -79.38, accuracy: 1_000 },
          } as GeolocationPosition),
        watchPosition: vi.fn((success: PositionCallback) => {
          watchSuccess = success
          return 91
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    })
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-a'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)

    // Both controls start with an enabled Check in button.
    expect(screen.getAllByRole('button', { name: /^check in$/i })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: /^check in$/i })[0])
    expect(await screen.findByText(/waiting for precise gps/i)).toBeInTheDocument()

    // ctrl-b's button is the only remaining "Check in"; it must be inert.
    expect(screen.getByRole('button', { name: /^check in$/i })).toBeDisabled()

    // The first control's acquisition still completes and is recorded.
    act(() => {
      watchSuccess({
        coords: { latitude: 43.65, longitude: -79.38, accuracy: 10 },
      } as GeolocationPosition)
    })
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(1))
    expect(mockCheckIn.mock.calls[0][1]).toMatchObject({ controlId: 'ctrl-a' })
  })
})

describe('BrevetCard hydration', () => {
  it('hydrates without a mismatch when check-ins are queued in localStorage', async () => {
    // Stay offline so the queued entry remains visible after hydration.
    mockCheckIn.mockRejectedValue(new Error('network down'))
    const data = makeData()

    // Server render: no localStorage exists there, so the outbox is empty.
    const html = renderToString(<BrevetCard token={TOKEN} initialData={data} />)

    // The rider's device queued a check-in on a previous load, then reloads.
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([{ controlId: 'ctrl-1', checkedInAt: new Date().toISOString() }])
    )

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const recoverableErrors: unknown[] = []
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, <BrevetCard token={TOKEN} initialData={data} />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        })
      })

      expect(recoverableErrors).toEqual([])
      expect(
        consoleSpy.mock.calls.filter((call) =>
          /hydrat|did not match|didn't match/i.test(String(call[0]))
        )
      ).toEqual([])

      // After mount, the queued entry is hydrated from storage and shown.
      await waitFor(() => {
        expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
      })
    } finally {
      consoleSpy.mockRestore()
      await act(async () => root?.unmount())
      container.remove()
    }
  })
})

describe('BrevetCard wrong-control detection', () => {
  it('warns when the GPS fix is inside a different control than the one tapped', async () => {
    // Device is physically at Exeter (ctrl-a); rider taps Ilderton (ctrl-b).
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-b'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeTwoControlData()} />)

    const buttons = screen.getAllByRole('button', { name: /^check in$/i })
    await user.click(buttons[1]) // Ilderton

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/you appear to be at exeter/i)
    expect(dialog).toHaveTextContent(/not ilderton/i)
    // Nothing recorded until the rider chooses.
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it('redirects the check-in to the control the rider is actually at', async () => {
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-a'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeTwoControlData()} />)

    await user.click(screen.getAllByRole('button', { name: /^check in$/i })[1]) // tap Ilderton
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /check in at exeter/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-a' })
      )
    })
    expect(mockCheckIn).not.toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ controlId: 'ctrl-b' })
    )
  })

  it('records at the tapped control when the rider chooses "anyway"', async () => {
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-b'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeTwoControlData()} />)

    await user.click(screen.getAllByRole('button', { name: /^check in$/i })[1]) // tap Ilderton
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /check in at ilderton anyway/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-b' })
      )
    })
  })
})

describe('BrevetCard early-window confirm', () => {
  it('confirms before recording a check-in at a control that has not opened', async () => {
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeNotOpenData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/doesn't open until/i)
    expect(mockCheckIn).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /check in anyway/i }))
    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-1' })
      )
    })
  })

  it('cancelling the early confirm records nothing', async () => {
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeNotOpenData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    // Give any stray async flush a chance to (not) fire.
    await new Promise((r) => setTimeout(r, 20))
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it('shows the early confirm on the manual (no-GPS) path too', async () => {
    // Insecure context forces the manual dialog; the control is still not open.
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1', 'manual'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeNotOpenData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    // First dialog: check in without GPS.
    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/check in without gps/i)
    await user.click(within(dialog).getByRole('button', { name: /check in anyway/i }))

    // Second dialog: the early-window confirm.
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toHaveTextContent(/doesn't open until/i)
    })
    expect(mockCheckIn).not.toHaveBeenCalled()

    dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /check in anyway/i }))
    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-1' })
      )
    })
  })

  it('uses the original tap time when GPS resolves after the control opens', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T16:00:00Z'))
    const data = makeTwoControlData()
    data.controls[1].opensAt = new Date(Date.now() + 30_000).toISOString()
    data.controls[1].closesAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    let watchSuccess!: PositionCallback
    const clearWatch = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 43.7, longitude: -79.38, accuracy: 1_000 },
          } as GeolocationPosition),
        watchPosition: vi.fn((success: PositionCallback) => {
          watchSuccess = success
          return 79
        }),
        clearWatch,
      },
      configurable: true,
    })
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-b'))
    const { unmount } = render(<BrevetCard token={TOKEN} initialData={data} />)

    try {
      fireEvent.click(screen.getAllByRole('button', { name: /^check in$/i })[1])
      expect(screen.getByText(/waiting for precise gps/i)).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(35_000)
        watchSuccess({
          coords: { latitude: 43.7, longitude: -79.38, accuracy: 10 },
        } as GeolocationPosition)
      })

      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent(/doesn't open until/i)
      expect(mockCheckIn).not.toHaveBeenCalled()
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })
})

describe('BrevetCard pre-start first-control check-in', () => {
  it('confirms with start-time copy and records the start time, not the tap time', async () => {
    stubGeolocation(43.65, -79.38)
    const data = makePreStartData()
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/recorded at the official start time/i)
    expect(dialog).not.toHaveTextContent(/doesn't open until/i)
    expect(mockCheckIn).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /^check in$/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ controlId: 'ctrl-1', checkedInAt: data.event.startsAt })
      )
    })
  })

  it('keeps the existing copy for a later control that has not opened', async () => {
    // makeNotOpenData: event started in the past, single control opens later —
    // the first-control-pre-start branch must not trigger.
    stubGeolocation(43.65, -79.38)
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeNotOpenData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/doesn't open until/i)
    expect(dialog).not.toHaveTextContent(/official start time/i)
  })
})

describe('BrevetCard undo', () => {
  function dataWithCheckin(over: { method?: string; receivedAtMsAgo?: number }): BrevetCardData {
    const data = makeData()
    const receivedAt = new Date(Date.now() - (over.receivedAtMsAgo ?? 60 * 1000)).toISOString()
    data.checkins = [
      {
        controlId: 'ctrl-1',
        checkedInAt: receivedAt,
        receivedAt,
        method: over.method ?? 'gps',
        distanceToControlM: over.method === 'manual' ? null : 12,
        flags: { ...NO_FLAGS },
      },
    ]
    return data
  }

  it('shows Undo on a fresh check-in and calls undoCheckin, restoring the check-in button', async () => {
    mockUndo.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof undoCheckin>>)

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={dataWithCheckin({})} />)

    await user.click(screen.getByRole('button', { name: /^undo$/i }))

    await waitFor(() => {
      expect(mockUndo).toHaveBeenCalledWith(TOKEN, { controlId: 'ctrl-1' })
    })
    // Row returns to a check-in-able state.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    })
  })

  it('does not show Undo for an organizer (admin) check-in', () => {
    render(<BrevetCard token={TOKEN} initialData={dataWithCheckin({ method: 'admin' })} />)
    expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument()
  })

  it('does not show Undo once the undo window has passed', () => {
    render(
      <BrevetCard
        token={TOKEN}
        initialData={dataWithCheckin({ receivedAtMsAgo: 20 * 60 * 1000 })}
      />
    )
    expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry gps/i })).not.toBeInTheDocument()
  })

  it('undoes a pending outbox entry by emptying the outbox (offline-safe)', async () => {
    // Keep the tap queued: the network is down.
    mockCheckIn.mockRejectedValue(new Error('network down'))

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    await waitFor(() => {
      expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^undo$/i }))

    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`)).toBeNull()
    // A retry may already have reached the server: best-effort undo it there too.
    expect(mockUndo).toHaveBeenCalledWith(TOKEN, { controlId: 'ctrl-1' })
  })

  it('does not send a later queued entry after it is undone behind a slow request', async () => {
    const data = makeTwoControlData()
    window.localStorage.setItem(
      `brevet-card-outbox-${TOKEN}`,
      JSON.stringify([
        { controlId: 'ctrl-a', checkedInAt: new Date().toISOString() },
        { controlId: 'ctrl-b', checkedInAt: new Date().toISOString() },
      ])
    )
    let resolveFirst!: (value: Awaited<ReturnType<typeof checkInAtControl>>) => void
    mockCheckIn.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof checkInAtControl>>>((resolve) => {
          resolveFirst = resolve
        })
    )

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={data} />)
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^undo$/i })).toHaveLength(2)
    })

    await user.click(screen.getAllByRole('button', { name: /^undo$/i })[1])
    expect(mockUndo).toHaveBeenCalledWith(TOKEN, { controlId: 'ctrl-b' })

    await act(async () => resolveFirst(checkinOk('ctrl-a')))
    await waitFor(() => {
      expect(window.localStorage.getItem(`brevet-card-outbox-${TOKEN}`)).toBeNull()
    })
    expect(mockCheckIn).toHaveBeenCalledTimes(1)
  })

  it('does not resurrect a check-in undone while its sync was in flight', async () => {
    // The check-in POST hangs (slow network) while the rider taps Undo on
    // the "Waiting to sync" row — then the POST succeeds.
    let resolveCheckin!: (v: Awaited<ReturnType<typeof checkInAtControl>>) => void
    mockCheckIn.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof checkInAtControl>>>((resolve) => {
          resolveCheckin = resolve
        })
    )

    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(screen.getByRole('button', { name: /^check in$/i }))
    await waitFor(() => {
      expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    })
    expect(mockUndo).toHaveBeenCalledTimes(1)

    // The in-flight sync lands AFTER the undo. It must not resurrect the
    // check-in locally, and the row it just created server-side must be
    // deleted again (second undoCheckin call).
    resolveCheckin(checkinOk('ctrl-1'))
    await waitFor(() => {
      expect(mockUndo).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByRole('button', { name: /^check in$/i })).toBeInTheDocument()
    expect(screen.queryByText(/waiting to sync/i)).not.toBeInTheDocument()
  })
})

describe('organizer + fine print', () => {
  it('renders the organizer block when contact is set', () => {
    const data = makeData()
    data.event.organizer = { name: 'Mark Allen', phone: '416-555-0101', email: 'vp@example.ca' }
    render(<BrevetCard token={TOKEN} initialData={data} />)
    expect(screen.getByText('Ride Organizer')).toBeTruthy()
    expect(screen.getByText('Mark Allen')).toBeTruthy()
    expect(screen.getByRole('link', { name: '416-555-0101' }).getAttribute('href')).toBe(
      'tel:416-555-0101'
    )
    expect(screen.getByRole('link', { name: 'vp@example.ca' }).getAttribute('href')).toBe(
      'mailto:vp@example.ca'
    )
  })

  it('omits the organizer block when no contact is set', () => {
    const data = makeData()
    data.event.organizer = { name: null, phone: null, email: null }
    render(<BrevetCard token={TOKEN} initialData={data} />)
    expect(screen.queryByText('Ride Organizer')).toBeNull()
  })

  it('renders the regulations fine print', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)
    expect(screen.getByText(/REGULATIONS:/)).toBeTruthy()
    expect(screen.getByText(/Les Randonneurs Mondiaux/)).toBeTruthy()
    expect(screen.getByText(/Emergency Services: 911/)).toBeTruthy()
  })
})

describe('route link', () => {
  it('links to the RWGPS route beneath the organizer info', () => {
    const data = makeData()
    data.event.rwgpsId = '12345678'
    render(<BrevetCard token={TOKEN} initialData={data} />)

    const link = screen.getByRole('link', { name: /view on ridewithgps/i })
    expect(link.getAttribute('href')).toBe('https://ridewithgps.com/routes/12345678')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('Route')).toBeInTheDocument()
  })

  it('omits the route box when the event has no RWGPS route', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    expect(screen.queryByText('Route')).toBeNull()
    expect(screen.queryByRole('link', { name: /view on ridewithgps/i })).toBeNull()
  })

  it('shows the route link inside the Ride Organizer card when both exist', () => {
    const data = makeData()
    data.event.organizer = { name: 'Mark Allen', phone: '416-555-0101', email: 'vp@example.ca' }
    data.event.rwgpsId = '12345678'
    render(<BrevetCard token={TOKEN} initialData={data} />)

    // One merged card: both the organizer and route sections render.
    expect(screen.getByText('Ride Organizer')).toBeInTheDocument()

    // The route link sits in the same card as the organizer contacts.
    const link = screen.getByRole('link', { name: /view on ridewithgps/i })
    expect(link.getAttribute('href')).toBe('https://ridewithgps.com/routes/12345678')
    const card = screen.getByText('Ride Organizer').closest('div')!
    expect(card).toContainElement(link)
    expect(card).toContainElement(screen.getByRole('link', { name: '416-555-0101' }))

    // Both labels render inside the one card.
    expect(screen.getByText('Route')).toBeInTheDocument()
    expect(card).toContainElement(screen.getByText('Route'))
  })
})

describe('check-in stamp', () => {
  it('renders a static (non-animated) stamp for a check-in present in initial data', () => {
    const data = makeData()
    data.checkins = [
      {
        controlId: 'ctrl-1',
        checkedInAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        method: 'gps',
        distanceToControlM: 12,
        flags: NO_FLAGS,
      },
    ]
    render(<BrevetCard token={TOKEN} initialData={data} />)

    const stamp = screen.getByTestId('control-stamp')
    expect(stamp.getAttribute('aria-hidden')).toBe('true')
    expect(stamp.className).not.toContain('animate-stamp-down')
    const img = stamp.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/stamp-green.svg')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\) rotate\(-?[\d.]+deg\)$/)
    // Overlap layout: the stamp is absolutely positioned so the notes text
    // flows full-width under it, and blends like ink (screen in dark mode).
    expect(stamp.className).toContain('absolute')
    expect(stamp.className).toContain('mix-blend-multiply')
    expect(stamp.className).toContain('dark:mix-blend-screen')
  })

  it('shows no stamp for a control without a check-in', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)
    expect(screen.queryByTestId('control-stamp')).toBeNull()
  })

  it('stamps with the thunk animation on a fresh check-in this session', async () => {
    mockCheckIn.mockResolvedValue(checkinOk('ctrl-1'))
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    fireEvent.click(screen.getByRole('button', { name: /check in/i }))

    const stamp = await screen.findByTestId('control-stamp')
    expect(stamp.className).toContain('animate-stamp-down')
    expect(stamp.className).toContain('motion-reduce:animate-none')
  })

  it('stamps a queued offline check-in before the server confirms', async () => {
    // Server never resolves — the entry stays in the outbox ("Waiting to sync").
    mockCheckIn.mockReturnValue(new Promise(() => {}))
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    fireEvent.click(screen.getByRole('button', { name: /check in/i }))

    const stamp = await screen.findByTestId('control-stamp')
    expect(stamp).toBeTruthy()
    expect(await screen.findByText(/waiting to sync/i)).toBeTruthy()
  })
})

describe('BrevetCard proactive location check', () => {
  it('shows the blocked banner when the site permission is denied', async () => {
    stubPermissions('denied')
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    expect(await screen.findByText(/location is blocked for this browser/i)).toBeInTheDocument()
  })

  it('shows nothing when permission is already granted', async () => {
    const perms = stubPermissions('granted')
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await waitFor(() => expect(perms.query).toHaveBeenCalled())
    expect(screen.queryByText(/location is blocked for this browser/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /test your location/i })).toBeNull()
  })

  it('offers Test your location when permission has never been decided', async () => {
    stubPermissions('prompt')
    stubGeolocation()
    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    const testButton = await screen.findByRole('button', { name: /test your location/i })
    await user.click(testButton)

    expect(await screen.findByText(/location works on this phone/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /test your location/i })).toBeNull()
  })

  it('flips to the blocked banner when the test fails with a permission denial', async () => {
    // OS-level "Never" can report 'prompt' but deny the actual request —
    // the test button is the reliable detector.
    stubPermissions('prompt')
    stubGeolocationError(1)
    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(await screen.findByRole('button', { name: /test your location/i }))

    expect(await screen.findByText(/location is blocked for this browser/i)).toBeInTheDocument()
  })

  it('tells riders in an embedded iOS browser to retry in Safari after no fix', async () => {
    const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      configurable: true,
    })
    stubPermissions('prompt')
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: () => {
          throw new DOMException('blocked by host', 'NotAllowedError')
        },
        watchPosition: () => {
          throw new DOMException('blocked by host', 'NotAllowedError')
        },
        clearWatch: vi.fn(),
      },
      configurable: true,
    })

    try {
      const user = userEvent.setup()
      render(<BrevetCard token={TOKEN} initialData={makeData()} />)
      await user.click(await screen.findByRole('button', { name: /test your location/i }))

      expect(await screen.findByText(/open this card in safari/i)).toBeInTheDocument()
    } finally {
      if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent)
      else Reflect.deleteProperty(navigator, 'userAgent')
    }
  })

  it('offers the test affordance when the Permissions API is unavailable', async () => {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    expect(await screen.findByRole('button', { name: /test your location/i })).toBeInTheDocument()
  })

  it('clears the banner live when the rider fixes settings (change event)', async () => {
    const perms = stubPermissions('denied')
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)
    await screen.findByText(/location is blocked for this browser/i)

    act(() => perms.setState('granted'))

    await waitFor(() => {
      expect(screen.queryByText(/location is blocked for this browser/i)).toBeNull()
    })
  })

  it('clears a stale success note when permission is revoked (change event)', async () => {
    // Rider tests location successfully, then revokes the site permission in
    // settings while the tab stays open. The blocked banner must replace the
    // success note — not render alongside it.
    const perms = stubPermissions('prompt')
    stubGeolocation()
    const user = userEvent.setup()
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    await user.click(await screen.findByRole('button', { name: /test your location/i }))
    await screen.findByText(/location works on this phone/i)

    act(() => perms.setState('denied'))

    expect(await screen.findByText(/location is blocked for this browser/i)).toBeInTheDocument()
    expect(screen.queryByText(/location works on this phone/i)).toBeNull()
  })

  it('offers the test affordance when permissions.query rejects', async () => {
    // Some browsers expose navigator.permissions but reject the query (e.g.
    // an unsupported descriptor) — the mount effect's .catch should still
    // land on 'prompt' and offer the test, same as an absent Permissions API.
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockRejectedValue(new Error('nope')) },
      configurable: true,
    })
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)

    expect(await screen.findByRole('button', { name: /test your location/i })).toBeInTheDocument()
  })

  it('does not offer the test once a GPS check-in already exists', async () => {
    const perms = stubPermissions('prompt')
    const data = makeData()
    data.checkins = [
      {
        controlId: 'ctrl-1',
        checkedInAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        method: 'gps',
        distanceToControlM: 12,
        flags: NO_FLAGS,
      },
    ]
    render(<BrevetCard token={TOKEN} initialData={data} />)

    await waitFor(() => expect(perms.query).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /test your location/i })).toBeNull()
  })
})

function makeLegSectionData(): BrevetCardData {
  const data = makeData()
  // Leg-tagged controls carry no window (per-leg distances restart at 0;
  // the overall event limit governs) — the payload sends nulls.
  data.controls = [
    {
      id: 'l1-c1',
      position: 1,
      name: 'Depart Gravenhurst',
      distanceKm: 0,
      lat: null,
      lng: null,
      radiusM: 500,
      notes: null,
      opensAt: null,
      closesAt: null,
      legName: 'Leg 1: Gravenhurst',
    },
    {
      id: 'l1-c2',
      position: 2,
      name: 'Arrive Gravenhurst',
      distanceKm: 205,
      lat: null,
      lng: null,
      radiusM: 500,
      notes: null,
      opensAt: null,
      closesAt: null,
      legName: 'Leg 1: Gravenhurst',
    },
    {
      id: 'l2-c1',
      position: 3,
      name: 'Depart Haliburton',
      distanceKm: 0,
      lat: null,
      lng: null,
      radiusM: 500,
      notes: null,
      opensAt: null,
      closesAt: null,
      legName: 'Leg 2: Haliburton',
    },
  ]
  return data
}

describe('BrevetCard leg section headings', () => {
  it('renders one heading per leg at each boundary, in order', () => {
    render(<BrevetCard token="tok" initialData={makeLegSectionData()} />)
    expect(screen.getAllByText('Leg 1: Gravenhurst')).toHaveLength(1)
    expect(screen.getAllByText('Leg 2: Haliburton')).toHaveLength(1)
    // All three controls still render.
    expect(screen.getByText('Depart Gravenhurst')).toBeTruthy()
    expect(screen.getByText('Arrive Gravenhurst')).toBeTruthy()
    expect(screen.getByText('Depart Haliburton')).toBeTruthy()

    // Headings appear in document order, not just in count.
    const headings = screen
      .getAllByRole('listitem')
      .filter((li) => /^Leg \d+:/.test(li.textContent ?? ''))
    expect(headings.map((li) => li.textContent)).toEqual([
      'Leg 1: Gravenhurst',
      'Leg 2: Haliburton',
    ])
  })

  it('renders no leg headings for single-route events', () => {
    render(<BrevetCard token="tok" initialData={makeData()} />)
    expect(screen.queryByText(/^Leg \d+:/)).toBeNull()
  })
})

describe('BrevetCard leg-control windows', () => {
  it('renders no open/close times line for leg-tagged controls (null window)', () => {
    render(<BrevetCard token="tok" initialData={makeLegSectionData()} />)
    // The times line is the only " – " range on the card.
    expect(screen.queryAllByText(/–/)).toHaveLength(0)
  })

  it('still renders the open/close times line for single-route controls', () => {
    render(<BrevetCard token={TOKEN} initialData={makeData()} />)
    expect(screen.getAllByText(/–/).length).toBeGreaterThan(0)
  })
})
