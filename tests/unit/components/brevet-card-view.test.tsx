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

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  stubGeolocation()
  // undoCheckin is fire-and-forget in the pending path (.catch on the result),
  // so it must resolve a promise even when a test doesn't assert on it.
  mockUndo.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof undoCheckin>>)
  // happy-dom leaves isSecureContext undefined; real browsers always set it.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
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
