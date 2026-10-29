'use client'

import { useEffect, useId, useRef, useState, useMemo } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { format, addDays, isBefore } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  registerForPermanent,
  completeRegistrationWithRider,
  type PermanentRideStart,
} from '@/lib/actions/register'
import {
  getPermanentRouteTrack,
  getExistingPermanentRide,
  type ExistingPermanentRide,
} from '@/lib/actions/permanent-start'
import type { ActiveRoute } from '@/lib/data/routes'
import { postedStartControlName, type RouteControl, type RouteTrack } from '@/lib/routeTrack'
import { RouteStartDialog } from '@/components/route-start-dialog'
import { formatClock } from '@/lib/permanent-start'
import { HoneypotField } from '@/components/honeypot-field'
import { useRegistrationForm } from '@/hooks/use-registration-form'
import {
  RegistrationError,
  RiderInfoFields,
  EmergencyContactFields,
  BrevetCardTypeField,
  ShareRegistrationCheckbox,
  NotesField,
} from '@/components/registration/registration-fields'
import { RegistrationSuccess } from '@/components/registration/registration-success'
import { RegistrationDialogs } from '@/components/registration/registration-dialogs'

const TORONTO_TZ = 'America/Toronto'

/** Exported for tests: midnight-hour Intl behavior is environment-sensitive. */
export function getMinPermanentDate(): Date {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TORONTO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    // 'h23', never hour12: false — h24 ICU builds report midnight as hour
    // "24", which would wrongly trip the >= 20:00 cutoff below.
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10)

  const torontoToday = new Date(get('year'), get('month') - 1, get('day'))
  const torontoHour = get('hour')

  // Before 20:00 ET → tomorrow is earliest; at/after 20:00 ET → day after tomorrow
  return addDays(torontoToday, torontoHour >= 20 ? 2 : 1)
}

const minDate = getMinPermanentDate()

interface PermanentRegistrationFormProps {
  routes: ActiveRoute[]
}

export function PermanentRegistrationForm({ routes }: PermanentRegistrationFormProps) {
  const form = useRegistrationForm()
  const { isPending, startTransition } = form

  // Route/schedule fields
  const [routeId, setRouteId] = useState<string>('')
  const [routePickerOpen, setRoutePickerOpen] = useState(false)
  const [eventDate, setEventDate] = useState<Date | undefined>(undefined)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [startTime, setStartTime] = useState<string>('08:00')
  const [startLocation, setStartLocation] = useState<string>('')
  // While the place name is a control's name the rider has not edited: the
  // distances of that control's passes. Null once the rider types.
  const [suggestedForKm, setSuggestedForKm] = useState<number[] | null>(null)
  const [startOffsetKm, setStartOffsetKm] = useState<number | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  // Focus returns here when the start dialog closes: "Change" once a start is
  // chosen (the opening button is gone by then), else the opening button.
  const startButtonRef = useRef<HTMLButtonElement>(null)
  const changeStartButtonRef = useRef<HTMLButtonElement>(null)
  const [direction, setDirection] = useState<'as_posted' | 'reversed'>('as_posted')
  const [notes, setNotes] = useState('')

  // Fuzzy matching context: the event created before the rider match was needed
  const [pendingEventId, setPendingEventId] = useState<string>('')
  // The ride's start when the match dialog opened, echoed back unchanged.
  const [pendingRideStart, setPendingRideStart] = useState<PermanentRideStart | undefined>()

  // Group routes by chapter
  const routesByChapter = useMemo(() => {
    const grouped: Record<string, ActiveRoute[]> = {}
    for (const route of routes) {
      const chapter = route.chapterName || 'Other'
      if (!grouped[chapter]) {
        grouped[chapter] = []
      }
      grouped[chapter].push(route)
    }
    // Sort chapters alphabetically
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [routes])

  const selectedRoute = routes.find((r) => r.id === routeId)

  // Each lookup result is stored with the inputs it answers, so a result for
  // an earlier route, date or direction is never shown for the current ones.
  const [trackFor, setTrackFor] = useState<{
    routeId: string
    track: RouteTrack | null
    controls: RouteControl[]
  } | null>(null)
  const [rideFor, setRideFor] = useState<{
    key: string
    ride: ExistingPermanentRide | null
  } | null>(null)

  // The route's track and controls name its posted start; on a loop they
  // also drive the start dialog.
  useEffect(() => {
    if (!routeId) return
    let cancelled = false
    getPermanentRouteTrack(routeId)
      .then((result) => {
        if (cancelled) return
        setTrackFor({
          routeId,
          track: result.available ? result.track : null,
          controls: result.available ? (result.controls ?? []) : [],
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [routeId])
  const current = trackFor?.routeId === routeId ? trackFor : null
  // Any route with a track names its posted start; only loops offer another.
  const loopTrack = current?.track?.isLoop ? current.track : null
  const routeControls = current?.controls
  const postedStartName = useMemo(
    () => (current?.track ? postedStartControlName(current.track, current.controls) : null),
    [current]
  )
  const startLabelId = useId()

  // One ride per route, date and direction: if it exists, its first
  // registrant set the start and later riders join on the same terms.
  const formattedEventDate = eventDate ? format(eventDate, 'yyyy-MM-dd') : null
  const rideKey =
    routeId && formattedEventDate ? `${routeId}|${formattedEventDate}|${direction}` : null
  useEffect(() => {
    if (!rideKey || !formattedEventDate) return
    let cancelled = false
    getExistingPermanentRide(routeId, formattedEventDate, direction)
      .then((ride) => {
        if (cancelled) return
        setRideFor({ key: rideKey, ride })
        // A ride locks the start and hides the start section. Close the
        // dialog too, or it would pop open by itself when the lock lifts.
        if (ride) setStartDialogOpen(false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [rideKey, routeId, formattedEventDate, direction])
  const existingRide = rideKey && rideFor?.key === rideKey ? rideFor.ride : null
  const startLocked = existingRide !== null

  // Joining an existing ride takes its start; the rider's own choices are
  // kept underneath and come back if the ride no longer applies.
  const effectiveStartTime = existingRide ? existingRide.startTime : startTime
  const effectiveOffsetKm = existingRide ? existingRide.startOffsetKm : startOffsetKm
  const effectiveStartLocation = existingRide
    ? existingRide.startOffsetKm == null
      ? ''
      : (existingRide.startLocation ?? '')
    : startOffsetKm == null
      ? ''
      : startLocation.trim()

  function clearAlternateStart() {
    setStartDialogOpen(false)
    setStartOffsetKm(null)
    setStartLocation('')
    setSuggestedForKm(null)
  }

  // Starting at a control suggests its name, but never replaces a name the
  // rider typed.
  function suggestStartLocation(name: string, passesKm: number[]) {
    if (startLocation.trim() !== '' && suggestedForKm == null) return
    setStartLocation(name)
    setSuggestedForKm(passesKm)
  }

  // A suggested name belongs to its control: moving the start anywhere else
  // (another pass of the same control is fine) drops it, so a control's name
  // is never printed for a start that is not there. Typed text stays.
  function changeStart(km: number | null) {
    setStartOffsetKm(km)
    if (suggestedForKm != null && (km == null || !suggestedForKm.includes(km))) {
      setStartLocation('')
      setSuggestedForKm(null)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    form.setError(null)

    if (!routeId) {
      form.setError('Please select a route')
      return
    }

    if (!eventDate) {
      form.setError('Please select a date')
      return
    }

    if (!startLocked && startOffsetKm != null && !startLocation.trim()) {
      form.setError('Please name your start location')
      return
    }

    submitRegistration()
  }

  /** `emailOverride` carries the address resolved by the typo confirmation. */
  function submitRegistration(emailOverride?: string) {
    if (!routeId || !formattedEventDate) return

    startTransition(async () => {
      const result = await registerForPermanent({
        routeId,
        eventDate: formattedEventDate,
        startTime: effectiveStartTime,
        startLocation: effectiveStartLocation,
        startOffsetKm: effectiveOffsetKm,
        direction,
        ...form.riderPayload,
        ...(emailOverride !== undefined && { email: emailOverride, emailConfirmed: true }),
        notes: notes || undefined,
      })
      form.handleRegistrationResult(result, {
        onNeedsMatch: (r) => {
          if (r.pendingData) {
            setPendingEventId(r.pendingData.eventId)
            setPendingRideStart(r.pendingData.rideStart)
          }
        },
      })
    })
  }

  function handleEmailConfirm(accepted: boolean) {
    submitRegistration(accepted ? form.acceptEmailSuggestion() : form.keepTypedEmail())
  }

  function handleRiderSelection(riderId: string | null) {
    startTransition(async () => {
      const result = await completeRegistrationWithRider({
        eventId: pendingEventId,
        selectedRiderId: riderId,
        rideStart: pendingRideStart,
        ...form.riderPayload,
        notes: notes || undefined,
      })
      form.handleRegistrationResult(result)
    })
  }

  if (form.success) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <RegistrationSuccess successRef={form.successRef} title="You're registered!">
          Your permanent ride has been scheduled. You&apos;ll receive a confirmation email shortly.
        </RegistrationSuccess>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <h2 className="font-serif text-2xl mb-6">Schedule Your Ride</h2>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <HoneypotField value={form.homepageUrl} onChange={form.setHomepageUrl} />
        <RegistrationError form={form} />

        {/* Route Selection Section */}
        <div className="space-y-5">
          <h3 className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Route Details
          </h3>

          {/* Route Selector */}
          <div className="space-y-2">
            <Label htmlFor="route">Route</Label>
            <Popover open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="route"
                  variant="outline"
                  role="combobox"
                  aria-expanded={routePickerOpen}
                  disabled={isPending}
                  className="w-full justify-between font-normal h-12 sm:h-9"
                >
                  {selectedRoute ? (
                    <span className="truncate">
                      {selectedRoute.name} ({selectedRoute.distanceKm} km)
                    </span>
                  ) : (
                    'Search routes…'
                  )}
                  <ChevronDownIcon className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name, chapter, or distance…" />
                  <CommandList>
                    <CommandEmpty>No routes found.</CommandEmpty>
                    {routesByChapter.map(([chapter, chapterRoutes]) => (
                      <CommandGroup key={chapter} heading={chapter}>
                        {chapterRoutes.map((route) => (
                          <CommandItem
                            key={route.id}
                            value={`${route.name} ${route.chapterName} ${route.distanceKm}`}
                            onSelect={() => {
                              // A start point belongs to one route.
                              if (route.id !== routeId) clearAlternateStart()
                              setRouteId(route.id)
                              setRoutePickerOpen(false)
                            }}
                            data-checked={routeId === route.id}
                          >
                            <div className="flex flex-col">
                              <span>{route.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {route.distanceKm} km
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedRoute && (
              <p className="text-xs text-muted-foreground">{selectedRoute.chapterName} Chapter</p>
            )}
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="date">Ride Date</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  id="date"
                  disabled={isPending}
                  className="w-full justify-between font-normal h-12 sm:h-9"
                >
                  {eventDate ? format(eventDate, 'EEEE, MMMM d, yyyy') : 'Select date'}
                  <ChevronDownIcon className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                <Calendar
                  mode="single"
                  selected={eventDate}
                  onSelect={(date) => {
                    setEventDate(date)
                    setDatePickerOpen(false)
                  }}
                  disabled={(date) => isBefore(date, minDate)}
                  defaultMonth={eventDate ?? minDate}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Registration closes at 8 p.m. Eastern the day before your ride
            </p>
          </div>

          {existingRide && (
            <div role="status" className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              A ride on this route is already registered for this date:{' '}
              {formatClock(existingRide.startTime)} from{' '}
              {existingRide.startOffsetKm == null
                ? 'the posted start'
                : `${existingRide.startLocation ?? 'a point'}, ${existingRide.startOffsetKm.toFixed(1)} km into the posted route`}
              . You will join that ride. To use a different start or time, pick another date.
            </div>
          )}

          {/* Time Picker */}
          <div className="space-y-2">
            <Label htmlFor="time">Start Time</Label>
            <Input
              id="time"
              type="time"
              value={effectiveStartTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isPending || startLocked}
              required
            />
          </div>

          {/* Start location: the posted start by default, with another start
              on loops. Hidden when an existing ride sets the start. The map
              itself is only in the dialog. */}
          {routeId && !startLocked && (
            <div role="group" aria-labelledby={startLabelId} className="space-y-2">
              <Label id={startLabelId}>Start location</Label>
              {startOffsetKm == null ? (
                <>
                  <p className="text-sm text-foreground">
                    {postedStartName
                      ? `Posted start: ${postedStartName}`
                      : "The route's posted start"}
                  </p>
                  {loopTrack && (
                    <Button
                      ref={startButtonRef}
                      type="button"
                      variant="outline"
                      className="w-full h-12 sm:h-9"
                      disabled={isPending}
                      onClick={() => setStartDialogOpen(true)}
                    >
                      Start somewhere else on the route
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="space-y-1">
                      <p className="text-sm text-foreground tabular-nums">
                        Starts {startOffsetKm.toFixed(1)} km into the posted route
                        {startLocation.trim() && ` from ${startLocation.trim()}`}
                      </p>
                      {!startLocation.trim() && (
                        <p className="text-xs text-muted-foreground">
                          This start still needs a name. Use Change to add one.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        ref={changeStartButtonRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 sm:h-8"
                        disabled={isPending}
                        onClick={() => setStartDialogOpen(true)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 sm:h-8"
                        disabled={isPending}
                        onClick={clearAlternateStart}
                      >
                        Use the posted start
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {loopTrack && (
                <RouteStartDialog
                  open={startDialogOpen}
                  onOpenChange={setStartDialogOpen}
                  track={loopTrack}
                  valueKm={startOffsetKm}
                  onChange={changeStart}
                  startLocation={startLocation}
                  onStartLocationChange={(name) => {
                    setStartLocation(name)
                    setSuggestedForKm(null)
                  }}
                  controls={routeControls}
                  onPickControl={suggestStartLocation}
                  disabled={isPending}
                  onCloseAutoFocus={(e) => {
                    e.preventDefault()
                    ;(startOffsetKm == null
                      ? startButtonRef
                      : changeStartButtonRef
                    ).current?.focus()
                  }}
                />
              )}
            </div>
          )}

          {/* Direction */}
          <div className="space-y-2">
            <Label htmlFor="direction">Direction</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as 'as_posted' | 'reversed')}
              disabled={isPending}
            >
              <SelectTrigger id="direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="as_posted">As Posted</SelectItem>
                <SelectItem value="reversed">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Rider Info Section */}
        <div className="space-y-5">
          <h3 className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Your Information
          </h3>

          <RiderInfoFields form={form} />
          <ShareRegistrationCheckbox form={form} />
          <EmergencyContactFields form={form} />
          <BrevetCardTypeField form={form} />
          <NotesField disabled={isPending} value={notes} onChange={setNotes} />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full h-12"
          size="lg"
          disabled={isPending}
          data-testid="registration-submit"
        >
          {isPending ? 'Scheduling…' : 'Schedule Permanent'}
        </Button>
      </form>

      <RegistrationDialogs
        form={form}
        onSelectRider={handleRiderSelection}
        onConfirmEmail={handleEmailConfirm}
      />
    </div>
  )
}
