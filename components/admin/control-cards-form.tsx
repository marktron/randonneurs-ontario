'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Printer, GripVertical, Download, Loader2 } from 'lucide-react'
import type { CardRider } from '@/types/control-card'

interface ControlInput {
  id: string
  name: string
  distance: string
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
}

export function ControlCardsForm({ event, riders, organizer }: ControlCardsFormProps) {
  // Organizer details - pre-fill from logged-in admin
  const [organizerName, setOrganizerName] = useState(organizer?.name || '')
  const [organizerPhone, setOrganizerPhone] = useState(organizer?.phone || '')
  const [organizerEmail, setOrganizerEmail] = useState(organizer?.email || '')

  // Controls - initialize with start and finish
  const [controls, setControls] = useState<ControlInput[]>([
    { id: crypto.randomUUID(), name: event.startLocation || 'Start', distance: '0' },
    { id: crypto.randomUUID(), name: 'Finish', distance: String(event.distance) },
  ])

  // Extra blank cards for day-of registrations
  const [extraBlankCards, setExtraBlankCards] = useState(0)

  const addControl = useCallback(() => {
    // Insert before the last control (finish)
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

  const [isLoadingRwgps, setIsLoadingRwgps] = useState(false)
  const [rwgpsError, setRwgpsError] = useState<string | null>(null)

  const importFromRwgps = useCallback(async () => {
    if (!event.rwgpsId) return

    setIsLoadingRwgps(true)
    setRwgpsError(null)

    try {
      const url = `https://ridewithgps.com/routes/${event.rwgpsId}.json`
      console.log('[RWGPS] Fetching route data from:', url)

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      // API returns route data at top level (not nested under "route")
      const route = data.route || data
      console.log('[RWGPS] Full API response:', data)
      console.log('[RWGPS] Route name:', route.name)
      console.log('[RWGPS] Route distance:', route.distance, 'meters')
      console.log('[RWGPS] Course points count:', route.course_points?.length)
      console.log('[RWGPS] Points of interest count:', route.points_of_interest?.length)

      // Extract controls from course_points where type is "Control"
      const coursePoints = route.course_points || []
      const controlPoints = coursePoints.filter((cp: { t?: string }) => cp.t === 'Control')
      console.log('[RWGPS] Control points found in course_points:', controlPoints.length)
      console.log('[RWGPS] Control points:', controlPoints)

      if (controlPoints.length === 0) {
        // Fallback: check points_of_interest for controls
        const pois = route.points_of_interest || []
        const poiControls = pois.filter(
          (poi: { poi_type_name?: string }) => poi.poi_type_name === 'control'
        )
        console.log('[RWGPS] POI controls found:', poiControls.length)

        if (poiControls.length === 0) {
          setRwgpsError(
            'No control points found in the RWGPS route. Add controls with type "Control" in the RideWithGPS route editor.'
          )
          return
        }

        // Use POI controls (distance needs to be calculated differently - they have lat/lng but no distance)
        // For now, show error suggesting to use course points instead
        setRwgpsError(
          'Found POI controls but they lack distance data. Please add controls as Course Points with type "Control" in RideWithGPS.'
        )
        return
      }

      // Map course_points to control inputs
      // d is distance in meters from route start
      const newControls: ControlInput[] = controlPoints.map(
        (cp: { n?: string; d?: number; description?: string }) => {
          // Clean up control name by removing common prefixes like "CTL", "CTRL", "CONTROL"
          let name = cp.n || 'Control'
          const prefixesToRemove = [
            'CTL - ',
            'CTL-',
            'CTL ',
            'CTRL - ',
            'CTRL-',
            'CTRL ',
            'CONTROL - ',
            'CONTROL-',
            'CONTROL ',
          ]
          for (const prefix of prefixesToRemove) {
            if (name.toUpperCase().startsWith(prefix)) {
              name = name.substring(prefix.length).trim()
              break
            }
          }
          // Also remove any leading "- " that might remain
          if (name.startsWith('- ')) {
            name = name.substring(2).trim()
          } else if (name.startsWith('-')) {
            name = name.substring(1).trim()
          }

          const distanceMeters = cp.d ?? 0
          const distanceKm = (distanceMeters / 1000).toFixed(1)
          console.log(`[RWGPS] Control: "${name}" at ${distanceKm}km (${distanceMeters}m)`)

          return {
            id: crypto.randomUUID(),
            name,
            distance: distanceKm,
          }
        }
      )

      // Sort by distance
      newControls.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))

      setControls(newControls)
      console.log('[RWGPS] Imported controls:', newControls)
    } catch (error) {
      console.error('[RWGPS] Error fetching route:', error)
      setRwgpsError(error instanceof Error ? error.message : 'Failed to fetch route data')
    } finally {
      setIsLoadingRwgps(false)
    }
  }, [event.rwgpsId])

  // Auto-import controls from RWGPS on mount
  useEffect(() => {
    if (event.rwgpsId) {
      importFromRwgps()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generatePrintUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('organizerName', organizerName)
    params.set('organizerPhone', organizerPhone)
    params.set('organizerEmail', organizerEmail)

    // Sort controls by distance before encoding
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

    if (extraBlankCards > 0) {
      params.set('extraBlank', String(extraBlankCards))
    }

    return `/admin/events/${event.id}/control-cards/print?${params.toString()}`
  }, [event.id, organizerName, organizerPhone, organizerEmail, controls, extraBlankCards])

  const isFormValid =
    organizerName &&
    organizerPhone &&
    organizerEmail &&
    controls.every((c) => c.name && c.distance !== '')

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
            Define control checkpoints along the route. Times will be calculated automatically based
            on BRM rules.
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
            {event.rwgpsId && (
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
          {!event.rwgpsId && (
            <p className="text-sm text-muted-foreground">
              No RWGPS route linked to this event. Add control points manually or link a route.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Registered Riders */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Riders ({riders.length})</CardTitle>
          <CardDescription>
            {riders.length === 0
              ? 'No riders registered. Two blank control cards will be generated.'
              : 'Control cards will be generated for these riders'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {riders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Two blank control cards will be printed for manual entry.
            </p>
          ) : (
            <div className="grid gap-1 md:grid-cols-3">
              {riders.map((rider) => (
                <div key={rider.id} className="text-sm">
                  {rider.firstName} {rider.lastName}
                </div>
              ))}
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
            Generate Control Cards
          </a>
        </Button>
        {!isFormValid && (
          <p className="text-sm text-muted-foreground self-center">
            Please fill in all organizer details and control points.
          </p>
        )}
      </div>
    </div>
  )
}
