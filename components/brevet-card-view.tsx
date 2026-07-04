'use client'

/**
 * Rider-facing digital brevet card (see docs/digital-brevet-card.md §7-8).
 *
 * Online-first with an offline outbox: every check-in is written to
 * localStorage before it is sent, so a tap in a dead zone is never lost.
 * The outbox retries on an interval, on the browser's `online` event, and
 * on page load. The server treats duplicate sends as idempotent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  checkInAtControl,
  type BrevetCardData,
  type CardCheckin,
  type CardControl,
} from '@/lib/actions/brevet-card'
import { formatControlTime } from '@/lib/brmTimes'
import { CHECKIN_WINDOW_BEFORE_START_MS } from '@/lib/brevet-card'
import { CheckCircle2, CloudOff, Loader2, MapPin } from 'lucide-react'

const OUTBOX_RETRY_INTERVAL_MS = 45 * 1000
const GEOLOCATION_TIMEOUT_MS = 12 * 1000

interface OutboxEntry {
  controlId: string
  checkedInAt: string
  lat?: number
  lng?: number
  accuracyM?: number
}

function outboxStorageKey(token: string): string {
  return `brevet-card-outbox-${token}`
}

function readOutbox(token: string): OutboxEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(outboxStorageKey(token))
    const parsed = raw ? (JSON.parse(raw) as OutboxEntry[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOutbox(token: string, entries: OutboxEntry[]): void {
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(outboxStorageKey(token))
    } else {
      window.localStorage.setItem(outboxStorageKey(token), JSON.stringify(entries))
    }
  } catch {
    // Storage full/blocked: persistence is best-effort. The in-memory
    // outboxRef is the source of truth for syncing, so the check-in still
    // sends for this page's lifetime — it's only lost if the tab closes
    // before it syncs.
  }
}

interface BrevetCardProps {
  token: string
  initialData: BrevetCardData
}

export function BrevetCard({ token, initialData }: BrevetCardProps) {
  const { event, rider, controls } = initialData

  const [checkins, setCheckins] = useState<Map<string, CardCheckin>>(
    () => new Map(initialData.checkins.map((c) => [c.controlId, c]))
  )
  // Starts empty (matching the server-rendered HTML — reading localStorage
  // in the initializer would cause a hydration mismatch) and is hydrated
  // from storage in the mount effect below.
  const [outbox, setOutbox] = useState<OutboxEntry[]>([])
  const [locatingControlId, setLocatingControlId] = useState<string | null>(null)
  const [manualControl, setManualControl] = useState<CardControl | null>(null)
  const [manualReason, setManualReason] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const flushInFlight = useRef(false)
  // Source of truth for syncing. localStorage is only a best-effort backup
  // for page reloads: writes can throw (quota, private mode) and must never
  // block a check-in from sending.
  const outboxRef = useRef<OutboxEntry[]>([])

  /**
   * Update the outbox ref *synchronously*, then mirror it into localStorage
   * (best-effort) and React state. The ref update must not live inside the
   * setOutbox updater: React defers updaters, so a flushOutbox() fired right
   * after enqueueing would see stale entries and sync nothing until the next
   * retry interval.
   */
  const persistOutbox = useCallback(
    (updater: (prev: OutboxEntry[]) => OutboxEntry[]) => {
      const next = updater(outboxRef.current)
      outboxRef.current = next
      writeOutbox(token, next)
      setOutbox(next)
    },
    [token]
  )

  /**
   * Try to send every queued check-in. Permanent rejections (server said no)
   * are dropped and surfaced; retryable rejections (rate limit, DB hiccup)
   * and network failures keep the entry queued for the next pass.
   */
  const flushOutbox = useCallback(async () => {
    if (flushInFlight.current) return
    flushInFlight.current = true
    try {
      const entries = outboxRef.current
      for (const entry of entries) {
        try {
          const result = await checkInAtControl(token, entry)
          if (result.success && result.data) {
            const { checkin } = result.data
            setCheckins((prev) => new Map(prev).set(checkin.controlId, checkin))
            persistOutbox((prev) => prev.filter((e) => e.controlId !== entry.controlId))
          } else if (result.retryable) {
            // Transient rejection (e.g. rate limited): stay queued and stop
            // this pass — later entries would hit the same wall.
            break
          } else {
            // The server rejected this check-in outright — retrying the
            // identical payload will never succeed, so stop queueing it.
            persistOutbox((prev) => prev.filter((e) => e.controlId !== entry.controlId))
            setErrorMessage(result.error || 'Check-in was rejected')
          }
        } catch {
          // Network failure: stay queued, try again on the next pass.
          break
        }
      }
    } finally {
      flushInFlight.current = false
    }
  }, [token, persistOutbox])

  // On mount: recover check-ins queued by a previous page load, then retry
  // queued check-ins now, when connectivity returns, and on an interval
  // while anything is pending.
  useEffect(() => {
    const stored = readOutbox(token)
    if (stored.length > 0) {
      const known = new Set(outboxRef.current.map((e) => e.controlId))
      const merged = [...stored.filter((e) => !known.has(e.controlId)), ...outboxRef.current]
      outboxRef.current = merged
      setOutbox(merged)
    }
    flushOutbox()
    const onOnline = () => flushOutbox()
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(() => {
      if (outboxRef.current.length > 0) flushOutbox()
    }, OUTBOX_RETRY_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [token, flushOutbox])

  const enqueueCheckin = useCallback(
    (entry: OutboxEntry) => {
      setErrorMessage(null)
      persistOutbox((prev) => [...prev.filter((e) => e.controlId !== entry.controlId), entry])
      // Fire-and-forget: the UI shows "queued" until the server confirms.
      void flushOutbox()
    },
    [persistOutbox, flushOutbox]
  )

  const handleCheckIn = useCallback(
    (control: CardControl) => {
      setErrorMessage(null)
      // Browsers disable geolocation on http:// (except localhost); calling
      // it would just burn the timeout before failing. Say why instead.
      if (!window.isSecureContext) {
        setManualReason(
          'Location needs a secure (HTTPS) connection, which this page does not have. You can still check in — the organizer will see it was recorded without GPS.'
        )
        setManualControl(control)
        return
      }
      if (!('geolocation' in navigator)) {
        setManualReason('Your browser does not support location.')
        setManualControl(control)
        return
      }
      setLocatingControlId(control.id)
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocatingControlId(null)
            enqueueCheckin({
              controlId: control.id,
              checkedInAt: new Date().toISOString(),
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyM: Math.round(position.coords.accuracy),
            })
          },
          () => {
            setLocatingControlId(null)
            setManualReason(
              'Your location could not be determined. You can still check in — the organizer will see it was recorded without GPS.'
            )
            setManualControl(control)
          },
          { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 30 * 1000 }
        )
      } catch {
        // Permissions-Policy blocks and some embedded webviews throw
        // synchronously instead of invoking the error callback — without
        // this catch the tap silently does nothing and the spinner sticks.
        setLocatingControlId(null)
        setManualReason(
          'Location is not available in this browser. You can still check in — the organizer will see it was recorded without GPS.'
        )
        setManualControl(control)
      }
    },
    [enqueueCheckin]
  )

  const queuedControlIds = useMemo(() => new Set(outbox.map((e) => e.controlId)), [outbox])

  const nextControlId = useMemo(() => {
    const next = controls.find((c) => !checkins.has(c.id) && !queuedControlIds.has(c.id))
    return next?.id ?? null
  }, [controls, checkins, queuedControlIds])

  const finishControl = controls[controls.length - 1]
  const finishDone = finishControl ? checkins.has(finishControl.id) : false
  const doneCount = controls.filter((c) => checkins.has(c.id) || queuedControlIds.has(c.id)).length

  const startsAt = new Date(event.startsAt)
  const checkinOpensAt = new Date(startsAt.getTime() - CHECKIN_WINDOW_BEFORE_START_MS)

  // Client-clock gate for the pre-event banner; re-evaluated on a timer so
  // the card unlocks while the page sits open at the start line. The server
  // enforces the real acceptance window regardless.
  const [beforeWindow, setBeforeWindow] = useState(false)
  useEffect(() => {
    const opensAtMs = new Date(event.startsAt).getTime() - CHECKIN_WINDOW_BEFORE_START_MS
    const update = () => setBeforeWindow(Date.now() < opensAtMs)
    update()
    const id = window.setInterval(update, 30 * 1000)
    return () => window.clearInterval(id)
  }, [event.startsAt])

  return (
    <div className="content-container pt-12 md:pt-20 max-w-2xl pb-16 space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{event.chapterName}</p>
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight">{event.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {event.distanceKm} km · {formatControlTime(startsAt)} start · {rider.firstName}{' '}
          {rider.lastName}
        </p>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {doneCount} of {controls.length} controls
        </p>
      </header>

      {beforeWindow && (
        <p className="text-sm border rounded-md p-3 bg-muted/50">
          Check-in opens at {formatControlTime(checkinOpensAt)} (two hours before the start).
        </p>
      )}

      {outbox.length > 0 && (
        <p className="text-sm border rounded-md p-3 bg-muted/50 flex items-center gap-2">
          <CloudOff className="h-4 w-4 shrink-0" />
          {outbox.length === 1 ? 'One check-in is' : `${outbox.length} check-ins are`} saved on this
          phone and will sync automatically when you have signal. Keep this page open.
        </p>
      )}

      {errorMessage && (
        <p className="text-sm border border-destructive/50 text-destructive rounded-md p-3">
          {errorMessage}
        </p>
      )}

      <ol className="divide-y border rounded-md">
        {controls.map((control) => {
          const checkin = checkins.get(control.id)
          const queued = !checkin && queuedControlIds.has(control.id)
          const isNext = control.id === nextControlId
          const isLocating = locatingControlId === control.id

          return (
            <li key={control.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {control.name}
                  <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                    {control.distanceKm} km
                  </span>
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatControlTime(new Date(control.opensAt))} –{' '}
                  {formatControlTime(new Date(control.closesAt))}
                </p>
                {control.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{control.notes}</p>
                )}
                {checkin?.flags.outOfRadius && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Recorded outside the control radius — the organizer will review it.
                  </p>
                )}
                {checkin?.flags.noGps && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Recorded without GPS — the organizer will review it.
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {checkin ? (
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    {formatControlTime(new Date(checkin.checkedInAt))}
                  </p>
                ) : queued ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CloudOff className="h-4 w-4" />
                    Waiting to sync
                  </p>
                ) : (
                  <Button
                    size="lg"
                    variant={isNext ? 'default' : 'outline'}
                    className="h-12"
                    disabled={isLocating || beforeWindow}
                    onClick={() => handleCheckIn(control)}
                  >
                    {isLocating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-2" />
                    )}
                    Check in
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {finishDone && (
        <div className="border rounded-md p-4 space-y-2">
          <p className="font-medium">Ride complete — congratulations!</p>
          <p className="text-sm text-muted-foreground">
            Submit your official result to finish the paperwork.
          </p>
          <Button asChild className="h-12">
            <Link href={`/registration/manage/${token}`}>Submit your result</Link>
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The digital card supplements your paper brevet card — keep collecting signatures or receipts
        as usual. Check-ins recorded offline sync automatically; if this page won&apos;t load at a
        control, your paper card is the backup.
      </p>

      <AlertDialog
        open={manualControl !== null}
        onOpenChange={(open) => !open && setManualControl(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check in without GPS?</AlertDialogTitle>
            <AlertDialogDescription>{manualReason}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (manualControl) {
                  enqueueCheckin({
                    controlId: manualControl.id,
                    checkedInAt: new Date().toISOString(),
                  })
                }
                setManualControl(null)
              }}
            >
              Check in anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
