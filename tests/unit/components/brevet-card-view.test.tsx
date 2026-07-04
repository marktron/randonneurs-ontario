/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrevetCard } from '@/components/brevet-card-view'
import type { BrevetCardData } from '@/lib/actions/brevet-card'
import { checkInAtControl } from '@/lib/actions/brevet-card'

vi.mock('@/lib/actions/brevet-card', () => ({
  checkInAtControl: vi.fn(),
}))

const mockCheckIn = vi.mocked(checkInAtControl)

const TOKEN = 'test-token'

function makeData(): BrevetCardData {
  // Started an hour ago so the check-in window is open.
  const startsAt = new Date(Date.now() - 60 * 60 * 1000)
  return {
    registration: { id: 'reg-1', status: 'registered' },
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
function stubGeolocation() {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    setTimeout(() => {
      success({
        coords: {
          latitude: 43.65,
          longitude: -79.38,
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
  // happy-dom leaves isSecureContext undefined; real browsers always set it.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
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
