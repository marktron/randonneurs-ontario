'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Plus, Trash2, Printer, GripVertical, Download, Loader2, ChevronDown } from 'lucide-react'
import type { ActiveRouteWithRwgps } from '@/lib/data/routes'
import { fetchRwgpsControls } from '@/lib/rwgps'

interface ControlInput {
  id: string
  name: string
  distance: string
}

interface RiderInput {
  id: string
  firstName: string
  lastName: string
}

const STORAGE_KEY = 'ro-registration'

function getSavedRiderData(): { firstName: string; lastName: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const data = JSON.parse(saved)
    if (data.firstName || data.lastName) {
      return { firstName: data.firstName || '', lastName: data.lastName || '' }
    }
    return null
  } catch {
    return null
  }
}

interface ControlCardFormProps {
  routes: ActiveRouteWithRwgps[]
}

export function ControlCardForm({ routes }: ControlCardFormProps) {
  // Route selection
  const [routeId, setRouteId] = useState<string>('')
  const [routePickerOpen, setRoutePickerOpen] = useState(false)

  // Date/time
  const [eventDate, setEventDate] = useState<Date | undefined>(undefined)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [startTime, setStartTime] = useState<string>('06:00')

  // Organizer details
  const [organizerName, setOrganizerName] = useState('')
  const [organizerPhone, setOrganizerPhone] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')

  // Controls
  const [controls, setControls] = useState<ControlInput[]>([
    { id: crypto.randomUUID(), name: 'Start', distance: '0' },
    { id: crypto.randomUUID(), name: 'Finish', distance: '' },
  ])

  // Riders
  const [riders, setRiders] = useState<RiderInput[]>([
    { id: crypto.randomUUID(), firstName: '', lastName: '' },
  ])

  // Extra blank cards
  const [extraBlankCards, setExtraBlankCards] = useState(0)

  // Pre-fill first rider from localStorage
  useEffect(() => {
    const saved = getSavedRiderData()
    if (saved) {
      setRiders((prev) => [{ ...prev[0], firstName: saved.firstName, lastName: saved.lastName }])
    }
  }, [])

  // RWGPS import state
  const [isLoadingRwgps, setIsLoadingRwgps] = useState(false)
  const [rwgpsError, setRwgpsError] = useState<string | null>(null)

  const selectedRoute = routes.find((r) => r.id === routeId)

  // Group routes by chapter
  const routesByChapter = useMemo(() => {
    const grouped: Record<string, ActiveRouteWithRwgps[]> = {}
    for (const route of routes) {
      const chapter = route.chapterName || 'Other'
      if (!grouped[chapter]) {
        grouped[chapter] = []
      }
      grouped[chapter].push(route)
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [routes])

  // Reset controls when route changes
  useEffect(() => {
    if (selectedRoute) {
      setControls([
        { id: crypto.randomUUID(), name: 'Start', distance: '0' },
        {
          id: crypto.randomUUID(),
          name: 'Finish',
          distance: String(selectedRoute.distanceKm || ''),
        },
      ])
      setRwgpsError(null)
    }
  }, [routeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addControl = useCallback(() => {
    const newControl = { id: crypto.randomUUID(), name: '', distance: '' }
    setControls((prev) => [...prev.slice(0, -1), newControl, prev[prev.length - 1]])
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

  const importFromRwgps = useCallback(async () => {
    if (!selectedRoute?.rwgpsId) return

    setIsLoadingRwgps(true)
    setRwgpsError(null)

    try {
      const parsed = await fetchRwgpsControls(selectedRoute.rwgpsId)
      setControls(
        parsed.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          distance: c.distance,
        }))
      )
    } catch (error) {
      setRwgpsError(error instanceof Error ? error.message : 'Failed to fetch route data')
    } finally {
      setIsLoadingRwgps(false)
    }
  }, [selectedRoute?.rwgpsId])

  // Auto-import controls from RWGPS when route changes
  useEffect(() => {
    if (selectedRoute?.rwgpsId) {
      importFromRwgps()
    }
  }, [routeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addRider = useCallback(() => {
    setRiders((prev) => [...prev, { id: crypto.randomUUID(), firstName: '', lastName: '' }])
  }, [])

  const removeRider = useCallback((id: string) => {
    setRiders((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const updateRider = useCallback((id: string, field: 'firstName' | 'lastName', value: string) => {
    setRiders((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  const generatePrintUrl = useCallback(() => {
    if (!selectedRoute || !eventDate) return '#'

    const params = new URLSearchParams()
    params.set('routeName', selectedRoute.name)
    params.set('distance', String(selectedRoute.distanceKm || 0))
    params.set('chapter', selectedRoute.chapterName || 'Randonneurs Ontario')
    params.set('eventDate', format(eventDate, 'yyyy-MM-dd'))
    params.set('startTime', startTime)
    params.set('organizerName', organizerName)
    params.set('organizerPhone', organizerPhone)
    params.set('organizerEmail', organizerEmail)

    const sortedControls = [...controls].sort(
      (a, b) => parseFloat(a.distance || '0') - parseFloat(b.distance || '0')
    )
    params.set(
      'controls',
      JSON.stringify(
        sortedControls.map((c) => ({
          name: c.name,
          distance: parseFloat(c.distance || '0'),
        }))
      )
    )

    params.set(
      'riders',
      JSON.stringify(
        riders.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
        }))
      )
    )

    if (extraBlankCards > 0) {
      params.set('extraBlank', String(extraBlankCards))
    }

    if (selectedRoute.rwgpsId) {
      params.set('rwgpsUrl', `https://ridewithgps.com/routes/${selectedRoute.rwgpsId}`)
    }

    return `/control-cards/print?${params.toString()}`
  }, [
    selectedRoute,
    eventDate,
    startTime,
    organizerName,
    organizerPhone,
    organizerEmail,
    controls,
    riders,
    extraBlankCards,
  ])

  const isFormValid =
    selectedRoute && eventDate && controls.every((c) => c.name && c.distance !== '')

  return (
    <div className="space-y-6">
      {/* Route Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Route</CardTitle>
          <CardDescription>Select a route and set the start date and time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Route Picker */}
          <div className="space-y-2">
            <Label htmlFor="route">Route</Label>
            <Popover open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={routePickerOpen}
                  className="w-full justify-between font-normal h-12 sm:h-9"
                >
                  {selectedRoute ? (
                    <span className="truncate">
                      {selectedRoute.name} ({selectedRoute.distanceKm} km)
                    </span>
                  ) : (
                    'Search routes\u2026'
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name, chapter, or distance\u2026" />
                  <CommandList>
                    <CommandEmpty>No routes found.</CommandEmpty>
                    {routesByChapter.map(([chapter, chapterRoutes]) => (
                      <CommandGroup key={chapter} heading={chapter}>
                        {chapterRoutes.map((route) => (
                          <CommandItem
                            key={route.id}
                            value={`${route.name} ${route.chapterName} ${route.distanceKm}`}
                            onSelect={() => {
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
              <p className="text-xs text-muted-foreground">
                {selectedRoute.chapterName} &middot; {selectedRoute.distanceKm} km
                {selectedRoute.rwgpsId && (
                  <>
                    {' '}
                    &middot;{' '}
                    <a
                      href={`https://ridewithgps.com/routes/${selectedRoute.rwgpsId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline underline-offset-2"
                    >
                      View on RWGPS
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Start Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="date"
                    className="w-full justify-between font-normal h-12 sm:h-9"
                  >
                    {eventDate ? format(eventDate, 'EEEE, MMMM d, yyyy') : 'Select date'}
                    <ChevronDown className="h-4 w-4 opacity-50" />
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
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Start Time</Label>
              <Input
                id="time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
            {selectedRoute?.rwgpsId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={importFromRwgps}
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
          {selectedRoute && !selectedRoute.rwgpsId && (
            <p className="text-sm text-muted-foreground">
              No RWGPS route linked. Add control points manually.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Riders */}
      <Card>
        <CardHeader>
          <CardTitle>Riders</CardTitle>
          <CardDescription>
            Add rider names for personalized control cards. Leave names blank for blank cards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {riders.map((rider) => (
              <div key={rider.id} className="flex items-center gap-2">
                <Input
                  placeholder="First name"
                  value={rider.firstName}
                  onChange={(e) => updateRider(rider.id, 'firstName', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Last name"
                  value={rider.lastName}
                  onChange={(e) => updateRider(rider.id, 'lastName', e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRider(rider.id)}
                  disabled={riders.length <= 1}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove rider</span>
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRider}>
            <Plus className="h-4 w-4 mr-1" />
            Add Rider
          </Button>
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
            Generate Control Cards
          </a>
        </Button>
        {!isFormValid && (
          <p className="text-sm text-muted-foreground self-center">
            Please select a route, date, and fill in control points.
          </p>
        )}
      </div>
    </div>
  )
}
