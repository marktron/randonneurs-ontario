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
  undoCheckin,
  type BrevetCardData,
  type CardCheckin,
  type CardControl,
} from '@/lib/actions/brevet-card'
import { formatControlTime } from '@/lib/brmTimes'
import { haversineMeters } from '@/lib/geo'
import {
  CHECKIN_WINDOW_BEFORE_START_MS,
  RIDER_UNDO_WINDOW_MS,
  detectWrongControl,
  formatDistanceKm,
  type WrongControlCandidate,
  type WrongControlDecision,
} from '@/lib/brevet-card'
import { CheckCircle2, CloudOff, Loader2, MapPin } from 'lucide-react'
import { BoldLabelText } from '@/components/bold-label-text'
import { REGULATIONS_TEXT, EVENT_INFO_TEXT } from '@/types/control-card'

const OUTBOX_RETRY_INTERVAL_MS = 45 * 1000
const GEOLOCATION_TIMEOUT_MS = 12 * 1000

interface OutboxEntry {
  controlId: string
  checkedInAt: string
  lat?: number
  lng?: number
  accuracyM?: number
}

/** A GPS fix captured at tap time, carried through the confirm dialogs. */
interface CheckinFix {
  lat: number
  lng: number
  accuracyM: number
  /** Device clock at the moment of the fix — preserved across confirmations. */
  checkedInAt: string
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

/** Rider-facing copy for the wrong-control confirm sheet. Pure. */
function wrongControlMessage(wc: {
  decision: WrongControlDecision
  tapped: CardControl
  fix: CheckinFix
}): string {
  const { decision, tapped, fix } = wc
  const candidate = decision.control
  if (decision.kind === 'already-checked-in') {
    return `You appear to be at ${candidate.name}, which you've already checked into. Check in at ${tapped.name} anyway?`
  }
  const tappedKm =
    tapped.lat !== null && tapped.lng !== null
      ? ` (${formatDistanceKm(haversineMeters(fix.lat, fix.lng, tapped.lat, tapped.lng))} km)`
      : ''
  return `You appear to be at ${candidate.name} (${formatDistanceKm(
    decision.distanceM
  )} km), not ${tapped.name}${tappedKm}.`
}

interface BrevetCardProps {
  token: string
  initialData: BrevetCardData
}

export function BrevetCard({ token, initialData }: BrevetCardProps) {
  const { event, rider, controls, registration } = initialData

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
  const [undoingControlId, setUndoingControlId] = useState<string | null>(null)
  // Wrong-control confirm (GPS only): the fix landed inside another control.
  const [wrongControl, setWrongControl] = useState<{
    decision: WrongControlDecision
    tapped: CardControl
    fix: CheckinFix
  } | null>(null)
  // Early-window confirm (all methods): tapped a control before it opens.
  const [earlyConfirm, setEarlyConfirm] = useState<{
    control: CardControl
    entry: OutboxEntry
  } | null>(null)
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
          // The rider may have tapped Undo while this request was in flight
          // (the undo path removes the entry from the outbox). Honour the
          // undo: don't resurrect the check-in locally, and delete the row
          // the request just created server-side.
          const undoneInFlight = !outboxRef.current.some((e) => e.controlId === entry.controlId)
          if (result.success && result.data) {
            const { checkin } = result.data
            if (undoneInFlight) {
              void undoCheckin(token, { controlId: checkin.controlId }).catch(() => {})
              continue
            }
            setCheckins((prev) => new Map(prev).set(checkin.controlId, checkin))
            persistOutbox((prev) => prev.filter((e) => e.controlId !== entry.controlId))
          } else if (result.retryable) {
            // Transient rejection (e.g. rate limited): stay queued and stop
            // this pass — later entries would hit the same wall.
            break
          } else {
            // The server rejected this check-in outright — retrying the
            // identical payload will never succeed, so stop queueing it.
            // No error toast if the rider already undid it: the rejection
            // is moot.
            persistOutbox((prev) => prev.filter((e) => e.controlId !== entry.controlId))
            if (!undoneInFlight) {
              setErrorMessage(result.error || 'Check-in was rejected')
            }
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

  /**
   * Record the check-in, but if the (final, post-redirect) target control
   * hasn't opened yet, confirm first. Applies to every method.
   */
  const enqueueOrConfirmEarly = useCallback(
    (control: CardControl, entry: OutboxEntry) => {
      if (Date.now() < new Date(control.opensAt).getTime()) {
        setEarlyConfirm({ control, entry })
        return
      }
      enqueueCheckin(entry)
    },
    [enqueueCheckin]
  )

  /**
   * A GPS fix arrived for `tapped`. If it lands inside a *different* control's
   * radius the rider probably tapped the wrong row — confirm/redirect before
   * recording. Otherwise fall through to the (possibly early) check-in.
   */
  const resolveGpsCheckin = useCallback(
    (tapped: CardControl, fix: CheckinFix) => {
      const others: WrongControlCandidate[] = controls
        .filter((c) => c.id !== tapped.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          radiusM: c.radiusM,
          alreadyCheckedIn:
            checkins.has(c.id) || outboxRef.current.some((e) => e.controlId === c.id),
        }))

      const decision = detectWrongControl(
        fix,
        { lat: tapped.lat, lng: tapped.lng, radiusM: tapped.radiusM },
        others
      )

      if (decision) {
        setWrongControl({ decision, tapped, fix })
        return
      }

      enqueueOrConfirmEarly(tapped, {
        controlId: tapped.id,
        checkedInAt: fix.checkedInAt,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
      })
    },
    [controls, checkins, enqueueOrConfirmEarly]
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
            resolveGpsCheckin(control, {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyM: Math.round(position.coords.accuracy),
              checkedInAt: new Date().toISOString(),
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
    [resolveGpsCheckin]
  )

  /**
   * Undo a check-in. For a synced check-in, ask the server (which enforces
   * the undo window and admin-method rules) and only clear locally on
   * success. For a pending outbox entry, remove it locally (works offline)
   * and fire-and-forget a server undo in case a retry already landed it.
   */
  const handleUndo = useCallback(
    async (control: CardControl) => {
      setErrorMessage(null)
      const pending =
        !checkins.has(control.id) && outboxRef.current.some((e) => e.controlId === control.id)

      if (pending) {
        persistOutbox((prev) => prev.filter((e) => e.controlId !== control.id))
        // A retried entry may have reached the server without the client
        // learning of it. Best-effort remove it there too; ignore not-found.
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          void undoCheckin(token, { controlId: control.id }).catch(() => {})
        }
        return
      }

      setUndoingControlId(control.id)
      try {
        const result = await undoCheckin(token, { controlId: control.id })
        if (result.success) {
          setCheckins((prev) => {
            const next = new Map(prev)
            next.delete(control.id)
            return next
          })
        } else {
          setErrorMessage(result.error || 'Could not undo the check-in')
        }
      } catch {
        setErrorMessage('Could not undo the check-in — check your connection and try again.')
      } finally {
        setUndoingControlId(null)
      }
    },
    [token, checkins, persistOutbox]
  )

  // Wrong-control sheet actions read from the `wrongControl` state so their
  // closures don't capture refs during render (React purity rules).
  const confirmWrongControlTapped = useCallback(() => {
    if (!wrongControl) return
    const { tapped, fix } = wrongControl
    setWrongControl(null)
    enqueueOrConfirmEarly(tapped, {
      controlId: tapped.id,
      checkedInAt: fix.checkedInAt,
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
    })
  }, [wrongControl, enqueueOrConfirmEarly])

  const confirmWrongControlCandidate = useCallback(() => {
    if (!wrongControl) return
    const { decision, fix } = wrongControl
    const candidateCardControl = controls.find((c) => c.id === decision.control.id)
    setWrongControl(null)
    if (!candidateCardControl) return
    enqueueOrConfirmEarly(candidateCardControl, {
      controlId: decision.control.id,
      checkedInAt: fix.checkedInAt,
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
    })
  }, [wrongControl, controls, enqueueOrConfirmEarly])

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
  // the card unlocks while the page sits open at the start line. The same
  // tick drives the rider-undo window on checked-in rows. Both start unset
  // (matching SSR — undo affordances and the pre-event banner are
  // client-only) and hydrate after mount. The server enforces the real
  // acceptance and undo windows regardless.
  const [beforeWindow, setBeforeWindow] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const opensAtMs = new Date(event.startsAt).getTime() - CHECKIN_WINDOW_BEFORE_START_MS
    const update = () => {
      const t = Date.now()
      setNow(t)
      setBeforeWindow(t < opensAtMs)
    }
    update()
    const id = window.setInterval(update, 30 * 1000)
    return () => window.clearInterval(id)
  }, [event.startsAt])

  return (
    <div className="content-container pt-12 md:pt-20 max-w-2xl pb-16 space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{event.chapterName}</p>
        <p className="text-base md:text-lg">
          Brevet card for{' '}
          <span className="font-medium">
            {rider.firstName} {rider.lastName}
          </span>
        </p>
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-2">{event.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {event.distanceKm} km · {formatControlTime(startsAt)} start
          {registration.isPreRide && (
            <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium align-middle">
              Pre-ride
            </span>
          )}
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
                  <div className="flex flex-col items-end">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {formatControlTime(new Date(checkin.checkedInAt))}
                    </p>
                    {checkin.method !== 'admin' &&
                      event.status !== 'submitted' &&
                      now !== null &&
                      now - new Date(checkin.receivedAt).getTime() < RIDER_UNDO_WINDOW_MS && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-auto px-2 py-1 text-xs text-muted-foreground"
                          disabled={undoingControlId === control.id}
                          onClick={() => handleUndo(control)}
                        >
                          {undoingControlId === control.id ? 'Undoing…' : 'Undo'}
                        </Button>
                      )}
                  </div>
                ) : queued ? (
                  <div className="flex flex-col items-end">
                    <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CloudOff className="h-4 w-4" />
                      Waiting to sync
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-auto px-2 py-1 text-xs text-muted-foreground"
                      onClick={() => handleUndo(control)}
                    >
                      Undo
                    </Button>
                  </div>
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

      {(event.organizer.name || event.organizer.phone || event.organizer.email) && (
        <div className="border rounded-md p-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ride Organizer</p>
          {event.organizer.name && <p className="font-medium">{event.organizer.name}</p>}
          {event.organizer.phone && (
            <p className="text-sm">
              <a className="underline underline-offset-2" href={`tel:${event.organizer.phone}`}>
                {event.organizer.phone}
              </a>
            </p>
          )}
          {event.organizer.email && (
            <p className="text-sm">
              <a className="underline underline-offset-2" href={`mailto:${event.organizer.email}`}>
                {event.organizer.email}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.regulations} />
        </p>
        <p className="font-medium">{REGULATIONS_TEXT.sagWagon}</p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.controlCard} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.conduct} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.cycle} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.assistance} />
        </p>
        <p>{EVENT_INFO_TEXT.preamble}</p>
        <p className="font-medium">{EVENT_INFO_TEXT.emergency}</p>
      </div>

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
                  enqueueOrConfirmEarly(manualControl, {
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

      <AlertDialog
        open={wrongControl !== null}
        onOpenChange={(open) => !open && setWrongControl(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wrong control?</AlertDialogTitle>
            <AlertDialogDescription>
              {wrongControl && wrongControlMessage(wrongControl)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {wrongControl?.decision.kind === 'redirect' && (
              <Button variant="outline" onClick={confirmWrongControlTapped}>
                Check in at {wrongControl.tapped.name} anyway
              </Button>
            )}
            <AlertDialogAction
              onClick={
                wrongControl?.decision.kind === 'redirect'
                  ? confirmWrongControlCandidate
                  : confirmWrongControlTapped
              }
            >
              {wrongControl?.decision.kind === 'redirect'
                ? `Check in at ${wrongControl.decision.control.name}`
                : `Check in at ${wrongControl?.tapped.name} anyway`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={earlyConfirm !== null}
        onOpenChange={(open) => !open && setEarlyConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Control not open yet</AlertDialogTitle>
            <AlertDialogDescription>
              {earlyConfirm &&
                `${earlyConfirm.control.name} doesn't open until ${formatControlTime(
                  new Date(earlyConfirm.control.opensAt)
                )}. Check in anyway?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (earlyConfirm) enqueueCheckin(earlyConfirm.entry)
                setEarlyConfirm(null)
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
