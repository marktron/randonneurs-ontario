'use client'

import { useState, useCallback, useEffect, useRef, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus,
  Trash2,
  Printer,
  GripVertical,
  Download,
  Loader2,
  Info,
  Save,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react'
import type { CardRider } from '@/types/control-card'
import {
  isReversedEvent,
  matchImportedControls,
  controlsInSync,
  groupControlsByLeg,
  MAX_CARD_CONTROLS,
} from '@/lib/controlPoints'
import {
  saveEventControls,
  getEventControlsForAdmin,
  importEventControlsFromRwgps,
  type AdminEventControl,
  type EventControlInput,
} from '@/lib/actions/event-controls'
import { DEFAULT_CONTROL_RADIUS_M } from '@/lib/brevet-card'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface ControlInput {
  id: string
  /** DB id of the saved event_controls row this maps to; absent for new rows. */
  savedId?: string
  name: string
  distance: string
  lat: number | null
  lng: number | null
  radiusM: number
  notes: string | null
  legRwgpsId: string | null
  legName: string | null
}

interface EventInput {
  id: string
  name: string
  routeName: string
  distance: number
  eventDate: string
  startTime: string
  startLocation: string
  chapter: string
  rwgpsId: string | null
  eventType: string
}

interface OrganizerInput {
  name: string
  phone: string
  email: string
}

interface ControlCardsFormProps {
  event: EventInput
  riders: CardRider[]
  organizer?: OrganizerInput
  /** Saved digital brevet card controls — the shared source of truth. */
  savedControls?: AdminEventControl[]
  /** When the event's results are submitted, controls are frozen. */
  eventSubmitted?: boolean
}

/** Build an editable row from a saved digital-card control. */
function rowFromSaved(control: AdminEventControl): ControlInput {
  return {
    id: crypto.randomUUID(),
    savedId: control.id,
    name: control.name,
    distance: String(control.distanceKm),
    lat: control.lat,
    lng: control.lng,
    radiusM: control.radiusM,
    notes: control.notes,
    legRwgpsId: control.legRwgpsId,
    legName: control.legName,
  }
}

export function ControlCardsForm({
  event,
  riders,
  organizer,
  savedControls = [],
  eventSubmitted = false,
}: ControlCardsFormProps) {
  // Organizer details - pre-fill from logged-in admin
  const [organizerName, setOrganizerName] = useState(organizer?.name || '')
  const [organizerPhone, setOrganizerPhone] = useState(organizer?.phone || '')
  const [organizerEmail, setOrganizerEmail] = useState(organizer?.email || '')

  const reversed = isReversedEvent(event.name)

  // Snapshot of the saved controls; drift is measured against this and it is
  // refreshed after a successful save so a subsequent save updates rather than
  // deletes-and-reinserts (which would wipe recorded check-ins).
  const [savedSnapshot, setSavedSnapshot] = useState<AdminEventControl[]>(savedControls)
  // Derived from the snapshot, not the prop, so the affordances flip from
  // "Save controls to this event" to in-sync/drift right after the first save
  // (the prop only changes on a full page load).
  const hasSavedControls = savedSnapshot.length > 0

  // Controls: prefill from the saved digital-card controls when they exist
  // (they are the shared source of truth); otherwise seed Start/Finish
  // (swapped for reversed routes) and auto-import from RWGPS on mount.
  const [controls, setControls] = useState<ControlInput[]>(() =>
    savedControls.length > 0
      ? savedControls.map(rowFromSaved)
      : [
          {
            id: crypto.randomUUID(),
            savedId: undefined,
            name: reversed ? 'Finish' : event.startLocation || 'Start',
            distance: '0',
            lat: null,
            lng: null,
            radiusM: DEFAULT_CONTROL_RADIUS_M,
            notes: null,
            legRwgpsId: null,
            legName: null,
          },
          {
            id: crypto.randomUUID(),
            savedId: undefined,
            name: reversed ? event.startLocation || 'Start' : 'Finish',
            distance: String(event.distance),
            lat: null,
            lng: null,
            radiusM: DEFAULT_CONTROL_RADIUS_M,
            notes: null,
            legRwgpsId: null,
            legName: null,
          },
        ]
  )

  // Extra blank cards for day-of registrations
  const [extraBlankCards, setExtraBlankCards] = useState(0)

  // Rider selection
  const [selectionMode, setSelectionMode] = useState<'all' | 'individual'>('all')
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(
    () => new Set(riders.map((r) => r.id))
  )

  const allRidersSelected = riders.length > 0 && riders.every((r) => selectedRiderIds.has(r.id))

  const toggleRider = useCallback((id: string) => {
    setSelectedRiderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedRiderIds((prev) => {
      const everyone = riders.every((r) => prev.has(r.id))
      return everyone ? new Set() : new Set(riders.map((r) => r.id))
    })
  }, [riders])

  const chosenRiderCount =
    selectionMode === 'individual'
      ? riders.filter((r) => selectedRiderIds.has(r.id)).length
      : riders.length

  const individualSelectionValid = selectionMode === 'all' || chosenRiderCount > 0

  // Grouped by leg for collection events (Task 3 imports tag every control
  // with its source leg); null for single-route events. Declared before
  // generatePrintUrl below, which depends on it.
  const legGroups = groupControlsByLeg(controls)
  const legCount = legGroups?.length ?? 1

  // The print page falls back to 2 blank cards when nothing else would print.
  const baseCardCount =
    chosenRiderCount + extraBlankCards > 0 ? chosenRiderCount + extraBlankCards : 2
  const cardCount = baseCardCount * legCount

  const addControl = useCallback(() => {
    // Insert before the last control (finish). Hand-added rows carry no
    // coordinates until an admin sets them in the digital brevet card manager.
    setControls((prev) => {
      const anchor = prev[prev.length - 1]
      const newControl: ControlInput = {
        id: crypto.randomUUID(),
        savedId: undefined,
        name: '',
        distance: '',
        lat: null,
        lng: null,
        radiusM: DEFAULT_CONTROL_RADIUS_M,
        notes: null,
        legRwgpsId: anchor?.legRwgpsId ?? null,
        legName: anchor?.legName ?? null,
      }
      return [...prev.slice(0, -1), newControl, prev[prev.length - 1]]
    })
  }, [])

  const removeControl = useCallback((id: string) => {
    setControls((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateControl = useCallback((id: string, field: 'name' | 'distance', value: string) => {
    setControls((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }, [])

  const moveControl = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= controls.length) return

      setControls((prev) => {
        const newControls = [...prev]
        const [moved] = newControls.splice(fromIndex, 1)
        newControls.splice(toIndex, 0, moved)
        return newControls
      })
    },
    [controls.length]
  )

  const [isLoadingRwgps, setIsLoadingRwgps] = useState(false)
  const [rwgpsError, setRwgpsError] = useState<string | null>(null)

  // ---- Digital brevet card sync ----------------------------------------
  const [isSaving, startSaveTransition] = useTransition()

  // Persist the given rows to the digital brevet card. Takes an explicit rows
  // argument so callers can save freshly-computed rows without waiting for a
  // setControls to commit (used by both the manual save affordance and the
  // mount auto-import path).
  const saveRows = useCallback(
    (rowsToSave: ControlInput[], successMessage = 'Controls saved to the digital brevet card') => {
      const inputs: EventControlInput[] = rowsToSave.map((c) => ({
        id: c.savedId,
        name: c.name,
        distanceKm: parseFloat(c.distance),
        lat: c.lat,
        lng: c.lng,
        radiusM: c.radiusM,
        notes: c.notes,
        legRwgpsId: c.legRwgpsId,
        legName: c.legName,
      }))

      startSaveTransition(async () => {
        const result = await saveEventControls(event.id, inputs)
        if (!result.success) {
          toast.error(result.error || 'Failed to save controls')
          return
        }
        toast.success(successMessage)

        // Refresh the snapshot and re-attach the freshly-assigned ids to the
        // current rows (matched by name/distance) so the next save updates rows
        // in place instead of delete+reinserting them (which wipes check-ins).
        const refreshed = await getEventControlsForAdmin(event.id)
        if (refreshed.success && refreshed.data) {
          const saved = refreshed.data
          setSavedSnapshot(saved)
          setControls((prev) => {
            const matched = matchImportedControls(
              prev.map((c) => ({ name: c.name, distanceKm: parseFloat(c.distance || '0') })),
              saved
            )
            return prev.map((c, i) => ({ ...c, savedId: matched[i]?.id ?? c.savedId }))
          })
        }
      })
    },
    [event.id]
  )

  const importFromRwgps = useCallback(
    async (options?: { autoSave?: boolean }) => {
      if (!event.rwgpsId) return

      setIsLoadingRwgps(true)
      setRwgpsError(null)

      try {
        // Canonical importer: fetches coordinates and applies reversed-event
        // handling server-side, so the printed and digital cards import
        // identically.
        const result = await importEventControlsFromRwgps(event.id)
        if (!result.success || !result.data) {
          setRwgpsError(result.error || 'Failed to fetch route data')
          return
        }

        // Preserve saved ids/radius/notes across a re-import so saving updates
        // rows in place rather than delete+reinserting (which loses check-ins).
        const matched = matchImportedControls(
          result.data.map((c) => ({ name: c.name, distanceKm: c.distanceKm })),
          savedSnapshot
        )
        const importedRows: ControlInput[] = result.data.map((c, i) => {
          const m = matched[i]
          return {
            id: crypto.randomUUID(),
            savedId: m?.id,
            name: c.name,
            distance: String(c.distanceKm),
            lat: c.lat,
            lng: c.lng,
            radiusM: m?.radiusM ?? DEFAULT_CONTROL_RADIUS_M,
            notes: m?.notes ?? null,
            legRwgpsId: c.legRwgpsId,
            legName: c.legName,
          }
        })
        setControls(importedRows)

        // Auto-save only from the mount auto-import path — never on a manual
        // "Import from RWGPS" click (drift UI handles persistence there) and
        // never once the event is submitted (controls are frozen). Pass the
        // freshly-imported rows directly so the save doesn't race setControls.
        if (options?.autoSave && !eventSubmitted) {
          saveRows(importedRows, 'Controls imported from RWGPS and saved to this event')
        }
      } catch (error) {
        setRwgpsError(error instanceof Error ? error.message : 'Failed to fetch route data')
      } finally {
        setIsLoadingRwgps(false)
      }
    },
    [event.id, event.rwgpsId, savedSnapshot, eventSubmitted, saveRows]
  )

  // Auto-import controls from RWGPS on mount — but only when there are no saved
  // controls to prefill from (saved controls are the source of truth) — and
  // auto-save the result so the form lands in sync without a manual click. The
  // ref guard keeps strict-mode's double-invoked effect from importing (and
  // saving) twice in development.
  const didAutoImportRef = useRef(false)
  useEffect(() => {
    if (didAutoImportRef.current) return
    if (event.rwgpsId && !hasSavedControls) {
      didAutoImportRef.current = true
      importFromRwgps({ autoSave: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generatePrintUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('organizerName', organizerName)
    params.set('organizerPhone', organizerPhone)
    params.set('organizerEmail', organizerEmail)

    // Leg-major for collection events (leg first-appearance order, distance
    // within a leg — matches how positions are stored); plain global distance
    // sort otherwise. Single-route entries keep the exact legacy shape.
    const sortByDistance = (list: ControlInput[]) =>
      [...list].sort((a, b) => parseFloat(a.distance || '0') - parseFloat(b.distance || '0'))
    const sortedControls = legGroups
      ? legGroups.flatMap((g) => sortByDistance(g.controls))
      : sortByDistance(controls)
    params.set(
      'controls',
      JSON.stringify(
        sortedControls.map((c) =>
          c.legRwgpsId != null && c.legName != null
            ? {
                name: c.name,
                distance: parseFloat(c.distance || '0'),
                legRwgpsId: c.legRwgpsId,
                legName: c.legName,
              }
            : { name: c.name, distance: parseFloat(c.distance || '0') }
        )
      )
    )

    if (extraBlankCards > 0) {
      params.set('extraBlank', String(extraBlankCards))
    }

    if (selectionMode === 'individual') {
      const ids = riders.filter((r) => selectedRiderIds.has(r.id)).map((r) => r.id)
      params.set('riderIds', ids.join(','))
    }

    return `/admin/events/${event.id}/control-cards/print?${params.toString()}`
  }, [
    event.id,
    organizerName,
    organizerPhone,
    organizerEmail,
    controls,
    legGroups,
    extraBlankCards,
    selectionMode,
    selectedRiderIds,
    riders,
  ])

  // Every row must have a name and a parseable distance before it can be saved.
  const controlsAreSaveable = controls.every(
    (c) => c.name.trim() !== '' && Number.isFinite(parseFloat(c.distance))
  )

  const inSync = controlsInSync(
    controls.map((c) => ({ name: c.name, distanceKm: parseFloat(c.distance || '0') })),
    savedSnapshot.map((c) => ({ name: c.name, distanceKm: c.distanceKm }))
  )

  const handleResetToSaved = useCallback(() => {
    setControls(savedSnapshot.map(rowFromSaved))
  }, [savedSnapshot])

  const handleSaveControls = useCallback(() => {
    saveRows(controls)
  }, [saveRows, controls])

  const oversizedLeg = legGroups?.find((g) => g.controls.length > MAX_CARD_CONTROLS) ?? null
  const tooManyControls = legGroups ? oversizedLeg !== null : controls.length > MAX_CARD_CONTROLS

  const isFormValid =
    organizerName &&
    organizerPhone &&
    organizerEmail &&
    controls.every((c) => c.name && c.distance !== '') &&
    individualSelectionValid &&
    !tooManyControls

  return (
    <div className="space-y-6">
      {/* Organizer Details */}
      <Card>
        <CardHeader>
          <CardTitle>Ride Organizer Details</CardTitle>
          <CardDescription>Contact information displayed on the control cards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="organizerName">Name</Label>
              <Input
                id="organizerName"
                placeholder="John Smith"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizerPhone">Phone</Label>
              <Input
                id="organizerPhone"
                placeholder="416-555-1234"
                value={organizerPhone}
                onChange={(e) => setOrganizerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizerEmail">Email</Label>
              <Input
                id="organizerEmail"
                type="email"
                placeholder="organizer@example.com"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Control Points */}
      <Card>
        <CardHeader>
          <CardTitle>Control Points</CardTitle>
          <CardDescription>
            The text in each control field will appear on the printed control card. Times are
            calculated automatically based on BRM rules.
          </CardDescription>
          {(reversed || (event.eventType === 'permanent' && event.startLocation)) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                {reversed && event.eventType === 'permanent' && event.startLocation
                  ? `Controls are shown in reversed direction, starting from ${event.startLocation}.`
                  : reversed
                    ? 'Controls are shown in reversed direction.'
                    : `Starting from ${event.startLocation}.`}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {controls.map((control, index) => (
              <div key={control.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveControl(index, 'up')}
                      disabled={index === 0}
                      className="h-3 hover:text-foreground disabled:opacity-30"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveControl(index, 'down')}
                      disabled={index === controls.length - 1}
                      className="h-3 hover:text-foreground disabled:opacity-30"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>
                <Input
                  placeholder="Control name"
                  value={control.name}
                  onChange={(e) => updateControl(control.id, 'name', e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="km"
                    value={control.distance}
                    onChange={(e) => updateControl(control.id, 'distance', e.target.value)}
                    className="w-24"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-sm text-muted-foreground">km</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeControl(control.id)}
                  disabled={controls.length <= 2}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove control</span>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addControl}>
              <Plus className="h-4 w-4 mr-1" />
              Add Control
            </Button>
            {event.rwgpsId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => importFromRwgps()}
                disabled={isLoadingRwgps}
              >
                {isLoadingRwgps ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Import from RWGPS
              </Button>
            )}
          </div>
          {rwgpsError && <p className="text-sm text-destructive">{rwgpsError}</p>}
          {!event.rwgpsId && !legGroups && (
            <p className="text-sm text-muted-foreground">
              No RWGPS route linked to this event. Add control points manually or link a route.
            </p>
          )}

          {/* Digital brevet card sync — hidden once the event is submitted. */}
          {!eventSubmitted && (
            <div className="border-t pt-4">
              {!hasSavedControls ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveControls}
                    disabled={!controlsAreSaveable || isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save controls to this event
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Saving makes these the digital brevet card&apos;s controls and enables GPS
                    check-in when coordinates are present.
                  </p>
                </div>
              ) : inSync ? (
                <p className="text-sm text-muted-foreground">
                  In sync with the digital brevet card controls.
                </p>
              ) : (
                <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>These controls differ from the saved digital-card controls.</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSaveControls}
                      disabled={!controlsAreSaveable || isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Update saved controls
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetToSaved}
                      disabled={isSaving}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset to saved
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registered Riders */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Registered Riders ({riders.length})</CardTitle>
              <CardDescription>
                {riders.length === 0
                  ? 'No riders registered. Two blank control cards will be generated.'
                  : 'Control cards will be generated for these riders'}
              </CardDescription>
            </div>
            {riders.length > 0 && (
              <ToggleGroup
                type="single"
                value={selectionMode}
                onValueChange={(v) => {
                  if (v) setSelectionMode(v as 'all' | 'individual')
                }}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                <ToggleGroupItem value="all">Everyone</ToggleGroupItem>
                <ToggleGroupItem value="individual">Choose</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {riders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Two blank control cards will be printed for manual entry.
            </p>
          ) : (
            <div className="space-y-4">
              {selectionMode === 'all' ? (
                <div className="grid gap-1 md:grid-cols-3">
                  {riders.map((rider) => (
                    <div key={rider.id} className="text-sm">
                      {rider.firstName} {rider.lastName}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={allRidersSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                    <Label htmlFor="select-all" className="text-sm text-muted-foreground">
                      Select all
                    </Label>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {riders.map((rider) => {
                      const label = `${rider.firstName} ${rider.lastName}`
                      return (
                        <div key={rider.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`rider-${rider.id}`}
                            checked={selectedRiderIds.has(rider.id)}
                            onCheckedChange={() => toggleRider(rider.id)}
                          />
                          <Label htmlFor={`rider-${rider.id}`} className="text-sm font-normal">
                            {label}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                  {chosenRiderCount === 0 && (
                    <p className="text-sm text-destructive">
                      Select at least one rider, or switch to All registered riders.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t">
            <Label htmlFor="extraBlank" className="text-sm whitespace-nowrap">
              Extra blank cards:
            </Label>
            <Input
              id="extraBlank"
              type="number"
              min="0"
              max="20"
              value={extraBlankCards}
              onChange={(e) => setExtraBlankCards(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">for day-of registrations</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4 items-center">
        <Button asChild disabled={!isFormValid}>
          <a
            href={isFormValid ? generatePrintUrl() : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={!isFormValid ? 'pointer-events-none opacity-50' : ''}
          >
            <Printer className="h-4 w-4 mr-2" />
            Generate {cardCount} Control Card{cardCount === 1 ? '' : 's'}
          </a>
        </Button>
        {tooManyControls && (
          <p className="text-sm text-destructive self-center">
            {oversizedLeg
              ? `${oversizedLeg.legName} has ${oversizedLeg.controls.length} controls — printed cards support at most ${MAX_CARD_CONTROLS} per leg. Merge or remove controls.`
              : `${controls.length} controls — printed cards support at most ${MAX_CARD_CONTROLS}. Merge or remove controls.`}
          </p>
        )}
        {!isFormValid && !tooManyControls && (
          <p className="text-sm text-muted-foreground self-center">
            Please fill in all organizer details and control points.
          </p>
        )}
      </div>
    </div>
  )
}
