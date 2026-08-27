'use client'

/**
 * Rider-facing digital brevet card (see docs/digital-brevet-card.md §7-8).
 *
 * Online-first with an offline outbox: every check-in is written to
 * localStorage before it is sent, so a tap in a dead zone is never lost.
 * The outbox retries on an interval, on the browser's `online` event, and
 * on page load. The server treats duplicate sends as idempotent.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  type CheckinInput,
} from '@/lib/actions/brevet-card'
import { formatControlTime } from '@/lib/brmTimes'
import { haversineMeters } from '@/lib/geo'
import {
  CHECKIN_WINDOW_BEFORE_START_MS,
  RIDER_UNDO_WINDOW_MS,
  detectWrongControl,
  formatDistanceKm,
  resolveRecordedCheckinTime,
  stampOffset,
  stampRotation,
  type WrongControlCandidate,
  type WrongControlDecision,
} from '@/lib/brevet-card'
import { detectLocationContext, detectPlatform, locationFixSteps } from '@/lib/location-help'
import { acquireGeolocation, MAX_USABLE_LOCATION_ACCURACY_M } from '@/lib/geolocation'
import type {
  LocationFailureDiagnostic,
  LocationFailureReason,
  LocationFailureStage,
} from '@/lib/location-diagnostics'
import { CheckCircle2, CloudOff, Loader2, Mail, Map as MapIcon, MapPin, Phone } from 'lucide-react'
import { BoldLabelText } from '@/components/bold-label-text'
import { REGULATIONS_TEXT, EVENT_INFO_TEXT } from '@/types/control-card'
import { cn } from '@/lib/utils'

const OUTBOX_RETRY_INTERVAL_MS = 45 * 1000

type OutboxEntry = CheckinInput & {
  /** Client-only identity for distinguishing replacements for the same control. */
  generation?: string
}

/** A GPS fix paired with the original tap time and carried through confirmations. */
interface CheckinFix {
  lat: number
  lng: number
  accuracyM: number
  /** Device clock at the tap, before GPS acquisition — preserved throughout. */
  checkedInAt: string
}

type LocationProgressStage = Exclude<LocationFailureStage, 'preflight'>
type ControlLocationIntent = 'checkin' | 'retry'

interface ManualCheckinPrompt {
  control: CardControl
  reason: string
  checkedInAt: string
  diagnostic: LocationFailureDiagnostic
}

interface BlockedLocationPrompt {
  control: CardControl
  checkedInAt: string
  diagnostic: LocationFailureDiagnostic
  intent: ControlLocationIntent
  expectedManualReceivedAt?: string
}

function manualLocationMessage(diagnostic: LocationFailureDiagnostic): string {
  if (diagnostic.reason === 'insecure_context') {
    return 'Location needs a secure (HTTPS) connection, which this page does not have. You can still check in — the organizer will see it was recorded without GPS.'
  }
  if (diagnostic.reason === 'unsupported') {
    return 'Your browser does not support location. You can still check in — the organizer will see it was recorded without GPS.'
  }
  if (diagnostic.context === 'embedded') {
    return 'This in-app browser could not provide your location. Open the card in Safari for the best chance of a GPS fix. You can still check in — the organizer will see it was recorded without GPS.'
  }
  if (diagnostic.reason === 'timeout') {
    return 'GPS did not get a fix after waiting. Try again outdoors if you can. You can still check in — the organizer will see it was recorded without GPS.'
  }
  if (diagnostic.reason === 'position_unavailable') {
    return 'Your phone could not pin down a usable location. Try again outdoors if you can. You can still check in — the organizer will see it was recorded without GPS.'
  }
  return 'Location is not available in this browser. You can still check in — the organizer will see it was recorded without GPS.'
}

function preflightLocationFailure(
  reason: Extract<LocationFailureReason, 'insecure_context' | 'unsupported'>,
  context: LocationFailureDiagnostic['context']
): LocationFailureDiagnostic {
  return { reason, stage: 'preflight', elapsedMs: 0, context }
}

function outboxStorageKey(token: string): string {
  return `brevet-card-outbox-${token}`
}

let outboxGenerationSequence = 0

function createOutboxGeneration(): string {
  outboxGenerationSequence += 1
  return `${Date.now().toString(36)}-${outboxGenerationSequence.toString(36)}`
}

/** Normalize old entries before they can hit stricter current server validation. */
function normalizeStoredOutboxEntry(value: unknown): OutboxEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.controlId !== 'string' || typeof raw.checkedInAt !== 'string') return null

  const entry = {
    ...raw,
    generation:
      typeof raw.generation === 'string' && raw.generation.length > 0
        ? raw.generation
        : createOutboxGeneration(),
  } as unknown as OutboxEntry
  if (
    typeof entry.accuracyM !== 'number' ||
    !Number.isFinite(entry.accuracyM) ||
    entry.accuracyM < 0 ||
    entry.accuracyM > MAX_USABLE_LOCATION_ACCURACY_M
  ) {
    delete entry.accuracyM
  }
  return entry
}

function sameOutboxGeneration(a: OutboxEntry, b: OutboxEntry): boolean {
  if (a.controlId !== b.controlId) return false
  if (a.generation !== undefined && b.generation !== undefined) {
    return a.generation === b.generation
  }
  return a === b
}

function outboxServerPayload(entry: OutboxEntry): CheckinInput {
  const payload = { ...entry }
  delete payload.generation
  return payload as CheckinInput
}

function readOutbox(token: string): OutboxEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(outboxStorageKey(token))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => normalizeStoredOutboxEntry(entry))
          .filter((entry): entry is OutboxEntry => entry !== null)
      : []
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
  const [locationProgressStage, setLocationProgressStage] = useState<LocationProgressStage>('quick')
  const [manualPrompt, setManualPrompt] = useState<ManualCheckinPrompt | null>(null)
  const [blockedPrompt, setBlockedPrompt] = useState<BlockedLocationPrompt | null>(null)
  const [retryGpsNotice, setRetryGpsNotice] = useState<{
    controlId: string
    message: string
  } | null>(null)
  // Proactive location-permission surface (see docs/digital-brevet-card.md).
  // 'unknown' until the mount effect resolves; nothing renders until then.
  const [locationStatus, setLocationStatus] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>(
    'unknown'
  )
  const [locationTest, setLocationTest] = useState<'idle' | 'testing' | 'ok' | 'no-fix'>('idle')
  const [locationTestStage, setLocationTestStage] = useState<LocationProgressStage>('quick')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [undoingControlId, setUndoingControlId] = useState<string | null>(null)
  // Wrong-control confirm (GPS only): the fix landed inside another control.
  const [wrongControl, setWrongControl] = useState<{
    decision: WrongControlDecision
    tapped: CardControl
    fix: CheckinFix
  } | null>(null)
  // Early-window confirm (all methods): tapped a control before it opens.
  // `opensAt` is the non-null window start — leg-tagged controls have no
  // window (opensAt null) and never trigger this confirm.
  const [earlyConfirm, setEarlyConfirm] = useState<{
    control: CardControl
    opensAt: string
    entry: OutboxEntry
    /** The "gathering at the start line" case, not a control that is shut. */
    atStart: boolean
  } | null>(null)
  const flushInFlight = useRef(false)
  const flushRequested = useRef(false)
  const activeLocationRequest = useRef<AbortController | null>(null)
  /** Controls with a server undo in flight; their outbox entries must not send. */
  const undoInFlight = useRef<Set<string>>(new Set())
  const locationProgressStageRef = useRef<LocationProgressStage>('quick')
  const checkinsRef = useRef<Map<string, CardCheckin>>(
    new Map(initialData.checkins.map((checkin) => [checkin.controlId, checkin]))
  )
  // Source of truth for syncing. localStorage is only a best-effort backup
  // for page reloads: writes can throw (quota, private mode) and must never
  // block a check-in from sending.
  const outboxRef = useRef<OutboxEntry[]>([])
  // Controls checked in during THIS session animate their stamp; stamps from
  // initialData render statically. State (not a ref): it is read during
  // render, and the repo's react-hooks/refs rule forbids render-time ref
  // reads.
  const [sessionCheckins, setSessionCheckins] = useState<Set<string>>(new Set())

  // SSR-safe: `navigator` does not exist during renderToString, and the
  // blocked dialog never renders on the server anyway.
  const locationEnvironment = useMemo(() => {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
    const standaloneNavigator =
      typeof navigator === 'undefined' ? null : (navigator as Navigator & { standalone?: boolean })
    const isStandalone =
      typeof window !== 'undefined' &&
      (standaloneNavigator?.standalone === true ||
        window.matchMedia?.('(display-mode: standalone)').matches === true)
    return {
      context: detectLocationContext(userAgent, isStandalone),
      help: locationFixSteps(detectPlatform(userAgent, isStandalone)),
    }
  }, [])
  const fixHelp = locationEnvironment.help

  // A geolocation watch must never survive navigation away from the card.
  useEffect(
    () => () => {
      activeLocationRequest.current?.abort()
      activeLocationRequest.current = null
    },
    []
  )

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

  const storeCheckin = useCallback((checkin: CardCheckin) => {
    const next = new Map(checkinsRef.current).set(checkin.controlId, checkin)
    checkinsRef.current = next
    setCheckins(next)
  }, [])

  const removeStoredCheckin = useCallback((controlId: string) => {
    const next = new Map(checkinsRef.current)
    next.delete(controlId)
    checkinsRef.current = next
    setCheckins(next)
  }, [])

  /**
   * Try to send every queued check-in. Permanent rejections (server said no)
   * are dropped and surfaced; retryable rejections (rate limit, DB hiccup)
   * and network failures keep the entry queued for the next pass.
   */
  const flushOutbox = useCallback(async () => {
    if (flushInFlight.current) {
      flushRequested.current = true
      return
    }
    flushInFlight.current = true
    let stoppedByTransientFailure = false
    try {
      do {
        flushRequested.current = false
        const entries = [...outboxRef.current]
        for (const entry of entries) {
          // A prior slow request may have allowed Undo or a replacement for
          // this control. Never send a stale snapshot entry.
          if (!outboxRef.current.some((queued) => sameOutboxGeneration(queued, entry))) continue
          // Undo is deciding this control's fate. Sending now would either
          // race the delete or report a bogus "check-in was removed" error.
          if (undoInFlight.current.has(entry.controlId)) continue

          try {
            const result = await checkInAtControl(token, outboxServerPayload(entry))
            const currentForControl = outboxRef.current.find(
              (queued) => queued.controlId === entry.controlId
            )
            const isCurrentGeneration =
              currentForControl !== undefined && sameOutboxGeneration(currentForControl, entry)

            if (result.success && result.data) {
              const { checkin, upgradedFromManual } = result.data
              if (!isCurrentGeneration) {
                // With no replacement, Undo removed this entry while it was
                // in flight. Clean up any row the request just created. If a
                // replacement exists, ignore this stale acknowledgement and
                // let the new generation make its own request.
                // Upgrade entries are update-only server-side: they can never
                // have created a row, so a compensating delete here would
                // destroy a row that Undo failed to remove.
                if (!currentForControl && entry.expectedManualReceivedAt === undefined) {
                  void undoCheckin(token, { controlId: checkin.controlId }).catch(() => {})
                }
                continue
              }

              storeCheckin(checkin)
              if (upgradedFromManual) {
                setRetryGpsNotice({
                  controlId: checkin.controlId,
                  message: 'GPS was added to your saved check-in.',
                })
              } else if (entry.lat !== undefined && checkin.method === 'manual') {
                setRetryGpsNotice({
                  controlId: checkin.controlId,
                  message:
                    'GPS could not replace the saved manual check-in. The organizer can still review it.',
                })
              }
              persistOutbox((prev) => prev.filter((queued) => !sameOutboxGeneration(queued, entry)))
            } else if (result.retryable) {
              // Transient rejection (e.g. rate limited): stay queued and stop
              // this pass — later entries would hit the same wall.
              stoppedByTransientFailure = true
              break
            } else if (isCurrentGeneration) {
              // The server rejected this exact payload permanently. A newer
              // replacement for the same control, if present, remains queued.
              persistOutbox((prev) => prev.filter((queued) => !sameOutboxGeneration(queued, entry)))
              setErrorMessage(result.error || 'Check-in was rejected')
            }
          } catch {
            // Network failure: stay queued, try again on the next pass.
            stoppedByTransientFailure = true
            break
          }
        }
      } while (!stoppedByTransientFailure && flushRequested.current)
    } finally {
      flushInFlight.current = false
      if (stoppedByTransientFailure) flushRequested.current = false
    }
  }, [token, persistOutbox, storeCheckin])

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

  // Detect a blocked/undecided location permission before the rider needs
  // it. The Permissions API sees site-level denials; OS-level "Never" often
  // reports 'prompt', which is why the affordance offers a real test.
  useEffect(() => {
    if (!window.isSecureContext || !('geolocation' in navigator)) return
    if (typeof navigator.permissions?.query !== 'function') {
      setLocationStatus('prompt')
      return
    }
    let cancelled = false
    let status: PermissionStatus | null = null
    const onChange = () => {
      if (cancelled || !status) return
      setLocationStatus(status.state)
      // A revoked permission invalidates any earlier successful test —
      // otherwise the card would show "works" and "blocked" side by side.
      if (status.state !== 'granted') setLocationTest('idle')
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (cancelled) return
        status = s
        setLocationStatus(s.state)
        s.addEventListener('change', onChange)
      })
      .catch(() => {
        // Older Safari quirks: treat as unqueryable, offer the test.
        if (!cancelled) setLocationStatus('prompt')
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [])

  const enqueueCheckin = useCallback(
    (entry: OutboxEntry) => {
      const queuedEntry =
        entry.generation === undefined ? { ...entry, generation: createOutboxGeneration() } : entry
      setErrorMessage(null)
      setSessionCheckins((prev) => new Set(prev).add(queuedEntry.controlId))
      persistOutbox((prev) => [
        ...prev.filter((existing) => existing.controlId !== queuedEntry.controlId),
        queuedEntry,
      ])
      // Fire-and-forget: the UI shows "queued" until the server confirms.
      void flushOutbox()
    },
    [persistOutbox, flushOutbox]
  )

  /**
   * Record the check-in, but if the (final, post-redirect) target control
   * hasn't opened yet, confirm first. Applies to every method.
   *
   * A pre-start tap at the first control is recorded at the official start,
   * not the tap time — but the server does that clamp itself. Send the tap
   * time and mirror the rule only in the confirm copy: a payload carrying
   * the (future) start time is a tap claiming to be from the future, which
   * the server rejects outright.
   */
  const enqueueOrConfirmEarly = useCallback(
    (control: CardControl, entry: OutboxEntry) => {
      const tappedAt = new Date(entry.checkedInAt)
      const recordsOfficialStart =
        resolveRecordedCheckinTime(
          tappedAt,
          new Date(event.startsAt),
          control.id === controls[0]?.id
        ).getTime() !== tappedAt.getTime()
      if (control.opensAt !== null && tappedAt.getTime() < new Date(control.opensAt).getTime()) {
        setEarlyConfirm({
          control,
          opensAt: control.opensAt,
          entry,
          atStart: recordsOfficialStart,
        })
        return
      }
      enqueueCheckin(entry)
    },
    [enqueueCheckin, controls, event.startsAt]
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
            checkinsRef.current.has(c.id) || outboxRef.current.some((e) => e.controlId === c.id),
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
    [controls, enqueueOrConfirmEarly]
  )

  const attemptControlLocation = useCallback(
    async (
      control: CardControl,
      intent: ControlLocationIntent,
      checkedInAt: string,
      expectedManualReceivedAt?: string
    ): Promise<void> => {
      setErrorMessage(null)
      setRetryGpsNotice(null)

      const showPreflightFailure = (
        reason: Extract<LocationFailureReason, 'insecure_context' | 'unsupported'>
      ) => {
        const diagnostic = preflightLocationFailure(reason, locationEnvironment.context)
        if (intent === 'checkin') {
          setManualPrompt({
            control,
            reason: manualLocationMessage(diagnostic),
            checkedInAt,
            diagnostic,
          })
        } else {
          setRetryGpsNotice({
            controlId: control.id,
            message:
              reason === 'insecure_context'
                ? 'GPS needs a secure HTTPS page. Your existing check-in is still saved.'
                : 'This browser does not support GPS. Your existing check-in is still saved.',
          })
        }
      }

      // Browsers disable geolocation on http:// (except localhost); calling
      // it would only delay the useful explanation.
      if (!window.isSecureContext) {
        showPreflightFailure('insecure_context')
        return
      }
      if (!navigator.geolocation) {
        showPreflightFailure('unsupported')
        return
      }

      activeLocationRequest.current?.abort()
      const controller = new AbortController()
      activeLocationRequest.current = controller
      setLocationTest((current) => (current === 'testing' ? 'idle' : current))
      setLocatingControlId(control.id)
      locationProgressStageRef.current = 'quick'
      setLocationProgressStage('quick')

      try {
        const result = await acquireGeolocation({
          geolocation: navigator.geolocation,
          context: locationEnvironment.context,
          signal: controller.signal,
          onStageChange: (stage) => {
            locationProgressStageRef.current = stage
            setLocationProgressStage(stage)
          },
        })
        if (controller.signal.aborted) return

        if (result.ok) {
          setLocationStatus('granted')
          const fix: CheckinFix = { ...result.fix, checkedInAt }
          if (intent === 'retry') {
            // An upgrade must not turn an honest "no GPS" row into a GPS row
            // recorded kilometres away: that erases the diagnostic and lands
            // as an out-of-radius fix. Only a fix inside this control's own
            // radius may replace the manual evidence.
            const distanceM =
              control.lat !== null && control.lng !== null
                ? haversineMeters(fix.lat, fix.lng, control.lat, control.lng)
                : null
            if (distanceM !== null && distanceM > control.radiusM) {
              setRetryGpsNotice({
                controlId: control.id,
                message: `GPS puts you ${formatDistanceKm(distanceM)} km from ${
                  control.name
                }. Your saved check-in was left as it is — retry at the control.`,
              })
              return
            }
            // This is an upgrade of the same check-in, not a new visit: keep
            // its original tap time and target control while replacing the
            // manual row with GPS server-side.
            enqueueCheckin({
              controlId: control.id,
              checkedInAt,
              lat: fix.lat,
              lng: fix.lng,
              accuracyM: fix.accuracyM,
              expectedManualReceivedAt,
            })
          } else {
            resolveGpsCheckin(control, fix)
          }
          return
        }

        const { diagnostic } = result
        if (diagnostic.reason === 'permission_denied') {
          // OS-level revocations do not always emit a Permissions API change
          // event on iOS, so synchronize the proactive surface here too.
          setLocationStatus('denied')
          setLocationTest('idle')
          setBlockedPrompt({
            control,
            checkedInAt,
            diagnostic,
            intent,
            expectedManualReceivedAt,
          })
          if (intent === 'retry') {
            setRetryGpsNotice({
              controlId: control.id,
              message: 'Location is blocked. Your existing check-in is still saved.',
            })
          }
        } else if (intent === 'checkin') {
          setManualPrompt({
            control,
            reason: manualLocationMessage(diagnostic),
            checkedInAt,
            diagnostic,
          })
        } else {
          setRetryGpsNotice({
            controlId: control.id,
            message:
              'GPS still could not get a fix. Your existing check-in is safe; try again outdoors.',
          })
        }
      } catch {
        if (controller.signal.aborted) return
        const diagnostic: LocationFailureDiagnostic = {
          reason: 'request_error',
          stage: locationProgressStageRef.current,
          elapsedMs: 0,
          context: locationEnvironment.context,
        }
        if (intent === 'checkin') {
          setManualPrompt({
            control,
            reason: manualLocationMessage(diagnostic),
            checkedInAt,
            diagnostic,
          })
        } else {
          setRetryGpsNotice({
            controlId: control.id,
            message: 'GPS could not be started. Your existing check-in is still saved.',
          })
        }
      } finally {
        if (activeLocationRequest.current === controller) {
          activeLocationRequest.current = null
          setLocatingControlId(null)
        }
      }
    },
    [enqueueCheckin, locationEnvironment.context, resolveGpsCheckin]
  )

  const handleCheckIn = useCallback(
    (control: CardControl) => {
      // Capture the tap before GPS acquisition and preserve it through every
      // timeout, retry, and confirmation dialog.
      void attemptControlLocation(control, 'checkin', new Date().toISOString())
    },
    [attemptControlLocation]
  )

  const handleRetryGps = useCallback(
    (control: CardControl, checkedInAt: string, receivedAt: string) => {
      void attemptControlLocation(control, 'retry', checkedInAt, receivedAt)
    },
    [attemptControlLocation]
  )

  const handleLocationTest = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationTest('no-fix')
      return
    }

    activeLocationRequest.current?.abort()
    const controller = new AbortController()
    activeLocationRequest.current = controller
    setLocatingControlId(null)
    setLocationTest('testing')
    setLocationTestStage('quick')

    void acquireGeolocation({
      geolocation: navigator.geolocation,
      context: locationEnvironment.context,
      signal: controller.signal,
      onStageChange: setLocationTestStage,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setLocationTest('ok')
          setLocationStatus('granted')
        } else if (result.diagnostic.reason === 'permission_denied') {
          setLocationStatus('denied')
          setLocationTest('idle')
        } else {
          setLocationTest('no-fix')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocationTest('no-fix')
      })
      .finally(() => {
        if (activeLocationRequest.current === controller) {
          activeLocationRequest.current = null
        }
      })
  }, [locationEnvironment.context])

  /**
   * Undo a check-in. For a synced check-in, ask the server (which enforces
   * the undo window and admin-method rules) and only clear locally on
   * success. For a pending outbox entry, remove it locally (works offline)
   * and fire-and-forget a server undo in case a retry already landed it.
   */
  const handleUndo = useCallback(
    async (control: CardControl) => {
      // Undo wins over an in-flight GPS upgrade. Aborting here as well as
      // disabling the button prevents a late fix from resurrecting the row.
      // Do not cancel a lookup for a different control (or the proactive
      // location test) when another row is undone.
      if (locatingControlId === control.id) {
        activeLocationRequest.current?.abort()
        activeLocationRequest.current = null
        setLocatingControlId(null)
        setLocationTest((current) => (current === 'testing' ? 'idle' : current))
      }
      setErrorMessage(null)
      setRetryGpsNotice((current) => (current?.controlId === control.id ? null : current))
      const hasQueuedEntry = outboxRef.current.some((e) => e.controlId === control.id)
      const pending = !checkinsRef.current.has(control.id) && hasQueuedEntry

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
      undoInFlight.current.add(control.id)
      try {
        const result = await undoCheckin(token, { controlId: control.id })
        if (result.success) {
          // Only now is the row gone, so the queued GPS upgrade can neither
          // recreate nor re-upgrade it. Dropping it any earlier loses the
          // rider's fix whenever the undo is refused or the network is down.
          if (hasQueuedEntry) {
            persistOutbox((prev) => prev.filter((e) => e.controlId !== control.id))
          }
          removeStoredCheckin(control.id)
        } else {
          setErrorMessage(result.error || 'Could not undo the check-in')
        }
      } catch {
        setErrorMessage('Could not undo the check-in — check your connection and try again.')
      } finally {
        undoInFlight.current.delete(control.id)
        setUndoingControlId(null)
      }
    },
    [token, locatingControlId, persistOutbox, removeStoredCheckin]
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

  // Once a GPS check-in exists, location demonstrably works — stop nudging.
  const hasGpsEvidence = useMemo(
    () =>
      Array.from(checkins.values()).some((c) => c.method === 'gps') ||
      outbox.some((e) => e.lat !== undefined),
    [checkins, outbox]
  )

  const nextControlId = useMemo(() => {
    const next = controls.find((c) => !checkins.has(c.id) && !queuedControlIds.has(c.id))
    return next?.id ?? null
  }, [controls, checkins, queuedControlIds])

  const finishControl = controls[controls.length - 1]
  const finishDone = finishControl ? checkins.has(finishControl.id) : false
  const doneCount = controls.filter((c) => checkins.has(c.id) || queuedControlIds.has(c.id)).length

  // One AbortController is shared by every acquisition, so a second tap
  // cancels the first control's lookup and loses it entirely. Only one
  // acquisition may be in flight; per-row labels still key off `isLocating`.
  const locationBusy = locatingControlId !== null

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

  const earlyConfirmAtStart = earlyConfirm?.atStart === true

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

      {locationStatus === 'denied' && (
        <div className="text-sm border rounded-md p-3 bg-muted/50 space-y-2">
          <p className="font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            Location is blocked for this browser
          </p>
          <p className="text-muted-foreground">
            Check-ins will be recorded without GPS until it&apos;s fixed. {fixHelp.intro}
          </p>
          <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
            {fixHelp.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locationTest === 'testing' || locatingControlId !== null}
            onClick={handleLocationTest}
          >
            {locationTest === 'testing'
              ? locationTestStage === 'quick'
                ? 'Checking recent location…'
                : 'Waiting for precise GPS…'
              : 'Try again'}
          </Button>
        </div>
      )}

      {locationStatus === 'prompt' && !hasGpsEvidence && (
        <div className="text-sm border rounded-md p-3 bg-muted/50 space-y-2">
          <p>
            <MapPin className="inline h-4 w-4 mr-1.5 align-text-bottom" />
            Check that location works on this phone before your ride — your browser will ask for
            permission.
          </p>
          {locationTest === 'no-fix' && (
            <p className="text-muted-foreground">
              {locationEnvironment.context === 'embedded'
                ? "Couldn't get a location fix in this in-app browser. Open this card in Safari and try again."
                : "Couldn't get a location fix just now — worth trying again, ideally outdoors."}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locationTest === 'testing' || locatingControlId !== null}
            onClick={handleLocationTest}
          >
            {locationTest === 'testing'
              ? locationTestStage === 'quick'
                ? 'Checking recent location…'
                : 'Waiting for precise GPS…'
              : 'Test your location'}
          </Button>
        </div>
      )}

      {locationTest === 'ok' && (
        <p className="text-sm border rounded-md p-3 bg-muted/50 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          Location works on this phone.
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
        {controls.map((control, index) => {
          const checkin = checkins.get(control.id)
          const queuedEntry = outbox.find((entry) => entry.controlId === control.id)
          const queued = !checkin && queuedEntry !== undefined
          const isNext = control.id === nextControlId
          const isLocating = locatingControlId === control.id
          const stamped = !!(checkin || queued)
          const gpsUpgradeQueued = checkin?.method === 'manual' && queuedEntry?.lat !== undefined
          const freshRiderCheckin =
            checkin !== undefined &&
            checkin.method !== 'admin' &&
            event.status !== 'submitted' &&
            now !== null &&
            now - new Date(checkin.receivedAt).getTime() < RIDER_UNDO_WINDOW_MS
          // Leg heading at each boundary (display-only; collection events).
          const legHeading =
            control.legName !== null &&
            control.legName !== (index > 0 ? controls[index - 1].legName : null)
              ? control.legName
              : null

          return (
            <Fragment key={control.id}>
              {legHeading && (
                <li className="px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
                  {legHeading}
                </li>
              )}
              <li
                className={cn(
                  'relative p-4 flex items-start justify-between gap-4',
                  stamped && 'min-h-36'
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {control.name}
                    <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                      {control.distanceKm} km
                    </span>
                  </p>
                  {control.opensAt !== null && control.closesAt !== null && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatControlTime(new Date(control.opensAt))} –{' '}
                      {formatControlTime(new Date(control.closesAt))}
                    </p>
                  )}
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
                  {retryGpsNotice?.controlId === control.id && (
                    <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
                      {retryGpsNotice.message}
                    </p>
                  )}
                  {gpsUpgradeQueued && (
                    <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
                      GPS fix saved — waiting to sync.
                    </p>
                  )}
                  {isLocating && (
                    <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
                      {locationProgressStage === 'quick'
                        ? 'Checking for a recent location…'
                        : 'Waiting for precise GPS — this can take up to 45 seconds, especially indoors.'}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {checkin ? (
                    <p className="relative z-10 inline-flex items-baseline gap-1.5 text-sm font-medium tabular-nums">
                      <CheckCircle2 className="h-4 w-4 self-center text-green-600" />
                      {formatControlTime(new Date(checkin.checkedInAt))}
                      {freshRiderCheckin && (
                        <>
                          {checkin.method === 'manual' && (
                            <>
                              <span
                                aria-hidden="true"
                                className="font-normal text-muted-foreground/50"
                              >
                                ·
                              </span>
                              <button
                                type="button"
                                className="-my-2 py-2 font-normal text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground disabled:opacity-50"
                                disabled={
                                  locationBusy ||
                                  gpsUpgradeQueued ||
                                  undoingControlId === control.id
                                }
                                onClick={() =>
                                  handleRetryGps(control, checkin.checkedInAt, checkin.receivedAt)
                                }
                              >
                                {isLocating
                                  ? 'Retrying GPS…'
                                  : gpsUpgradeQueued
                                    ? 'GPS queued'
                                    : 'Retry GPS'}
                              </button>
                            </>
                          )}
                          <span aria-hidden="true" className="font-normal text-muted-foreground/50">
                            ·
                          </span>
                          <button
                            type="button"
                            className="-my-2 py-2 font-normal text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground disabled:opacity-50"
                            disabled={isLocating || undoingControlId === control.id}
                            onClick={() => handleUndo(control)}
                          >
                            {undoingControlId === control.id ? 'Undoing…' : 'Undo'}
                          </button>
                        </>
                      )}
                    </p>
                  ) : queued ? (
                    <p className="relative z-10 inline-flex items-baseline gap-1.5 text-sm text-muted-foreground">
                      <CloudOff className="h-4 w-4 self-center" />
                      Waiting to sync
                      <span aria-hidden="true" className="text-muted-foreground/50">
                        ·
                      </span>
                      <button
                        type="button"
                        className="-my-2 py-2 underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                        onClick={() => handleUndo(control)}
                      >
                        Undo
                      </button>
                    </p>
                  ) : (
                    <Button
                      size="lg"
                      variant={isNext ? 'default' : 'outline'}
                      className="h-12"
                      disabled={locationBusy || beforeWindow}
                      onClick={() => handleCheckIn(control)}
                    >
                      {isLocating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      {isLocating
                        ? locationProgressStage === 'quick'
                          ? 'Checking location…'
                          : 'Waiting for GPS…'
                        : 'Check in'}
                    </Button>
                  )}
                </div>

                {stamped && (
                  <span
                    data-testid="control-stamp"
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none select-none absolute right-4 top-9 bottom-0 flex items-center mix-blend-multiply dark:mix-blend-screen',
                      sessionCheckins.has(control.id) &&
                        'animate-stamp-down motion-reduce:animate-none'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/stamp-green.svg"
                      alt=""
                      width={128}
                      height={88}
                      className="w-32 max-w-none"
                      style={{
                        transform: `translate(${stampOffset(control.id).dx}px, ${stampOffset(control.id).dy}px) rotate(${stampRotation(control.id)}deg)`,
                      }}
                    />
                  </span>
                )}
              </li>
            </Fragment>
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

      {(event.organizer.name ||
        event.organizer.phone ||
        event.organizer.email ||
        event.rwgpsId) && (
        <div className="rounded-lg border bg-muted/40 p-5">
          {(event.organizer.name || event.organizer.phone || event.organizer.email) && (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Ride Organizer
              </p>
              {event.organizer.name && (
                <p className="mt-1.5 text-lg font-semibold leading-tight">{event.organizer.name}</p>
              )}
              {(event.organizer.phone || event.organizer.email) && (
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {event.organizer.phone && (
                    <a
                      href={`tel:${event.organizer.phone}`}
                      className="group inline-flex w-fit items-center gap-2.5 py-0.5 transition-colors hover:text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="tabular-nums underline decoration-border underline-offset-4 transition-colors group-hover:decoration-primary">
                        {event.organizer.phone}
                      </span>
                    </a>
                  )}
                  {event.organizer.email && (
                    <a
                      href={`mailto:${event.organizer.email}`}
                      className="group inline-flex w-fit items-center gap-2.5 py-0.5 transition-colors hover:text-primary"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="break-all underline decoration-border underline-offset-4 transition-colors group-hover:decoration-primary">
                        {event.organizer.email}
                      </span>
                    </a>
                  )}
                </div>
              )}
            </>
          )}
          {event.rwgpsId && (
            <>
              <p
                className={cn(
                  'text-xs font-medium uppercase tracking-widest text-muted-foreground',
                  (event.organizer.name || event.organizer.phone || event.organizer.email) && 'mt-5'
                )}
              >
                Route
              </p>
              <div className="mt-3 text-sm">
                <a
                  href={`https://ridewithgps.com/routes/${event.rwgpsId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-fit items-center gap-2.5 py-0.5 transition-colors hover:text-primary"
                >
                  <MapIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <span className="underline decoration-border underline-offset-4 transition-colors group-hover:decoration-primary">
                    View on RideWithGPS
                  </span>
                </a>
              </div>
            </>
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
        open={manualPrompt !== null}
        onOpenChange={(open) => !open && setManualPrompt(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check in without GPS?</AlertDialogTitle>
            <AlertDialogDescription>{manualPrompt?.reason}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (manualPrompt) {
                  enqueueOrConfirmEarly(manualPrompt.control, {
                    controlId: manualPrompt.control.id,
                    checkedInAt: manualPrompt.checkedInAt,
                    locationFailure: manualPrompt.diagnostic,
                  })
                }
                setManualPrompt(null)
              }}
            >
              Check in anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={blockedPrompt !== null}
        onOpenChange={(open) => !open && setBlockedPrompt(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Location is blocked</AlertDialogTitle>
            <AlertDialogDescription>{fixHelp.intro}</AlertDialogDescription>
          </AlertDialogHeader>
          <ol className="list-decimal ml-5 space-y-1 text-sm text-muted-foreground">
            {fixHelp.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {blockedPrompt?.intent === 'checkin' && (
              <Button
                variant="outline"
                onClick={() => {
                  const prompt = blockedPrompt
                  setBlockedPrompt(null)
                  if (prompt) {
                    enqueueOrConfirmEarly(prompt.control, {
                      controlId: prompt.control.id,
                      checkedInAt: prompt.checkedInAt,
                      locationFailure: prompt.diagnostic,
                    })
                  }
                }}
              >
                Check in without GPS
              </Button>
            )}
            <AlertDialogAction
              onClick={() => {
                const prompt = blockedPrompt
                setBlockedPrompt(null)
                if (prompt) {
                  void attemptControlLocation(
                    prompt.control,
                    prompt.intent,
                    prompt.checkedInAt,
                    prompt.expectedManualReceivedAt
                  )
                }
              }}
            >
              Try again
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
            <AlertDialogTitle>
              {earlyConfirmAtStart ? 'Before the start' : 'Control not open yet'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {earlyConfirm &&
                (earlyConfirmAtStart
                  ? `You're checking in before the start. Your check-in will be recorded at the official start time (${formatControlTime(
                      new Date(event.startsAt)
                    )}).`
                  : `${earlyConfirm.control.name} doesn't open until ${formatControlTime(
                      new Date(earlyConfirm.opensAt)
                    )}. Check in anyway?`)}
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
              {earlyConfirmAtStart ? 'Check in' : 'Check in anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
