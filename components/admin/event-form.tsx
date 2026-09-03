'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, CalendarIcon, ChevronDownIcon } from 'lucide-react'
import { createEvent, updateEvent, type EventType } from '@/lib/actions/events'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getCurrentSeason, getCurrentSeasonLabel } from '@/lib/season'
import type { ChapterOption } from '@/types/ui'
import type { ActiveRoute } from '@/lib/data/routes'
import { ImageUpload } from '@/components/admin/image-upload'

export interface EventFormData {
  id: string
  name: string
  chapterId: string | null
  routeId: string | null
  eventType: string
  distanceKm: number
  eventDate: string // YYYY-MM-DD
  startTime: string | null
  startLocation: string | null
  description: string | null
  imageUrl: string | null
}

interface EventFormProps {
  chapters: ChapterOption[]
  routes: ActiveRoute[]
  defaultChapterId?: string | null
  event?: EventFormData | null
  mode?: 'create' | 'edit'
  headerAction?: React.ReactNode
  isSuperAdmin?: boolean
}

// Match the order used in the main site navbar
const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'brevet', label: 'Brevet' },
  { value: 'populaire', label: 'Populaire' },
  { value: 'fleche', label: 'Flèche' },
  { value: 'permanent', label: 'Permanent' },
]

type Visibility = 'draft' | 'published'

/** Events dated in a season after the current one start hidden. */
function defaultVisibilityFor(year: number | undefined): Visibility {
  if (year === undefined) return 'published'
  return year > getCurrentSeason() ? 'draft' : 'published'
}

/** Year from an ISO `YYYY-MM-DD` date string, without going through `Date`. */
function yearFromIsoDate(isoDate: string): number {
  return parseInt(isoDate.slice(0, 4), 10)
}

export function EventForm({
  chapters,
  routes,
  defaultChapterId,
  event,
  mode = 'create',
  headerAction,
  isSuperAdmin = false,
}: EventFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showBrevetRestrictionModal, setShowBrevetRestrictionModal] = useState(false)
  const [showBrevetConfirmModal, setShowBrevetConfirmModal] = useState(false)

  const currentSeason = getCurrentSeasonLabel()

  // Initialize state from event data in edit mode, or defaults in create mode
  const [chapterId, setChapterId] = useState(event?.chapterId || defaultChapterId || '')
  const [routeId, setRouteId] = useState<string | null>(event?.routeId || null)
  const [routePickerOpen, setRoutePickerOpen] = useState(false)
  const [name, setName] = useState(event?.name || '')
  const [eventType, setEventType] = useState<EventType>((event?.eventType as EventType) || 'brevet')
  const [distanceKm, setDistanceKm] = useState(event?.distanceKm?.toString() || '')
  const [eventDate, setEventDate] = useState<Date | undefined>(
    event?.eventDate ? new Date(event.eventDate + 'T00:00:00') : undefined
  )
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>(() =>
    defaultVisibilityFor(event?.eventDate ? yearFromIsoDate(event.eventDate) : undefined)
  )
  const [visibilityTouched, setVisibilityTouched] = useState(false)
  const [startTime, setStartTime] = useState(event?.startTime || '')
  const [startLocation, setStartLocation] = useState(event?.startLocation || '')
  const [description, setDescription] = useState(event?.description || '')
  const [imageUrl, setImageUrl] = useState(event?.imageUrl || '')

  // Separate chapters into main chapters and others
  const mainChapters = CHAPTER_ORDER.map((name) => chapters.find((c) => c.name === name)).filter(
    (c): c is ChapterOption => c !== undefined
  )

  const otherChapters = chapters
    .filter((c) => !CHAPTER_ORDER.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filter routes by selected chapter
  const filteredRoutes = useMemo(() => {
    if (!chapterId) return routes
    return routes.filter((r) => r.chapterId === chapterId)
  }, [routes, chapterId])

  // Get selected route
  const selectedRoute = routes.find((r) => r.id === routeId)

  // When chapter changes, clear route if it doesn't belong to the new chapter
  const handleChapterChange = (newChapterId: string) => {
    setChapterId(newChapterId)
    if (routeId) {
      const route = routes.find((r) => r.id === routeId)
      if (route && route.chapterId !== newChapterId) {
        setRouteId(null)
      }
    }
  }

  // When a route is selected, auto-fill distance and name
  const handleRouteSelect = (route: ActiveRoute) => {
    setRouteId(route.id)
    setRoutePickerOpen(false)

    if (route.distanceKm) {
      setDistanceKm(route.distanceKm.toString())
    }
    if (!name.trim()) {
      setName(route.name)
    }
  }

  const performSubmit = (formattedDate: string) => {
    startTransition(async () => {
      if (mode === 'edit' && event) {
        const result = await updateEvent(event.id, {
          name: name.trim(),
          chapterId,
          routeId: routeId || null,
          eventType,
          distanceKm: parseFloat(distanceKm),
          eventDate: formattedDate,
          startTime: startTime || null,
          startLocation: startLocation.trim() || null,
          description: description.trim() || null,
          imageUrl: imageUrl || null,
        })

        if (result.success) {
          toast.success('Event updated successfully')
          router.push(`/admin/events/${event.id}`)
        } else {
          setError(result.error || 'Failed to update event')
        }
      } else {
        const result = await createEvent({
          name: name.trim(),
          chapterId,
          routeId: routeId || null,
          eventType,
          distanceKm: parseFloat(distanceKm),
          eventDate: formattedDate,
          startTime: startTime || null,
          startLocation: startLocation.trim() || null,
          description: description.trim() || null,
          imageUrl: imageUrl || null,
          status: visibility === 'draft' ? 'draft' : 'scheduled',
        })

        if (result.success) {
          toast.success(visibility === 'draft' ? 'Draft saved' : 'Event created successfully')
          router.push('/admin/events')
        } else {
          setError(result.error || 'Failed to create event')
        }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Event name is required')
      return
    }

    if (!chapterId) {
      setError('Chapter is required')
      return
    }

    if (!eventDate) {
      setError('Event date is required')
      return
    }

    if (!distanceKm || parseFloat(distanceKm) <= 0) {
      setError('Distance must be greater than 0')
      return
    }

    // Check if trying to create a new brevet for the current season
    if (mode === 'create' && eventType === 'brevet') {
      const eventYear = eventDate.getFullYear().toString()
      if (eventYear === currentSeason) {
        if (isSuperAdmin) {
          setShowBrevetConfirmModal(true)
        } else {
          setShowBrevetRestrictionModal(true)
        }
        return
      }
    }

    // Format date as YYYY-MM-DD for the server
    const formattedDate = format(eventDate, 'yyyy-MM-dd')

    performSubmit(formattedDate)
  }

  return (
    <>
      <Dialog open={showBrevetRestrictionModal} onOpenChange={setShowBrevetRestrictionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Create Brevet</DialogTitle>
            <DialogDescription>
              New brevets cannot be created for {currentSeason}. You can still edit existing brevets
              or create a permanent, populaire, or fleche event.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowBrevetRestrictionModal(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showBrevetConfirmModal} onOpenChange={setShowBrevetConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Brevet for Current Season?</DialogTitle>
            <DialogDescription>
              This brevet is dated in the current season ({currentSeason}). Are you sure you want to
              create it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBrevetConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowBrevetConfirmModal(false)
                if (eventDate) {
                  performSubmit(format(eventDate, 'yyyy-MM-dd'))
                }
              }}
            >
              Create Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'edit' ? 'Edit Event' : 'Create Event'}</CardTitle>
          {mode === 'create' && <CardDescription>Add a new event to the schedule</CardDescription>}
          {headerAction && <div data-slot="card-action">{headerAction}</div>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Chapter and Route Selection */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chapter">Chapter</Label>
                <Select
                  value={chapterId || 'none'}
                  onValueChange={(v) => handleChapterChange(v === 'none' ? '' : v)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select chapter</SelectItem>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Chapters</SelectLabel>
                      {mainChapters.map((chapter) => (
                        <SelectItem key={chapter.id} value={chapter.id}>
                          {chapter.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {otherChapters.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Other</SelectLabel>
                          {otherChapters.map((chapter) => (
                            <SelectItem key={chapter.id} value={chapter.id}>
                              {chapter.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="route">Route (optional)</Label>
                <Popover open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={routePickerOpen}
                      disabled={isPending}
                      className="w-full justify-between font-normal"
                    >
                      {selectedRoute ? (
                        <span className="truncate">
                          {selectedRoute.name}{' '}
                          {selectedRoute.distanceKm && `(${selectedRoute.distanceKm} km)`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search routes…</span>
                      )}
                      <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name or distance…" />
                      <CommandList>
                        <CommandEmpty>No routes found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              setRouteId(null)
                              setRoutePickerOpen(false)
                            }}
                          >
                            No route
                          </CommandItem>
                        </CommandGroup>
                        <CommandGroup
                          heading={
                            chapterId
                              ? chapters.find((c) => c.id === chapterId)?.name
                              : 'All Routes'
                          }
                        >
                          {filteredRoutes.map((route) => (
                            <CommandItem
                              key={route.id}
                              value={`${route.name} ${route.distanceKm}`}
                              onSelect={() => handleRouteSelect(route)}
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
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {chapterId
                ? `Showing ${filteredRoutes.length} routes for selected chapter`
                : 'Select a chapter to filter routes'}
            </p>

            {/* Event Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Event Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Waterloo Spring 200"
                required
                disabled={isPending}
              />
            </div>

            {/* Event Type, Distance, Date */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="eventType">Event Type</Label>
                <Select
                  value={eventType}
                  onValueChange={(v) => setEventType(v as EventType)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="distance">Distance (km)</Label>
                <Input
                  id="distance"
                  type="number"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  placeholder="200"
                  min="1"
                  step="1"
                  required
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventDate">Date</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="eventDate"
                      variant="outline"
                      disabled={isPending}
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !eventDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {eventDate ? format(eventDate, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={eventDate}
                      defaultMonth={eventDate}
                      onSelect={(date) => {
                        setEventDate(date)
                        setDatePickerOpen(false)
                        if (!visibilityTouched)
                          setVisibility(defaultVisibilityFor(date?.getFullYear()))
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Start Time and Location */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startLocation">Start Location</Label>
                <Input
                  id="startLocation"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="e.g., Tim Hortons, 123 Main St, Waterloo"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add event details, special instructions, or notes. Markdown formatting is supported."
                rows={4}
                disabled={isPending}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Supports markdown formatting (bold, italic, links, lists)
              </p>
            </div>

            {/* Event Image */}
            <div className="space-y-2">
              <Label>Event Image (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Add an image to display with this event
              </p>
              <ImageUpload
                value={imageUrl || null}
                onChange={(url) => setImageUrl(url || '')}
                folder="events"
                disabled={isPending}
              />
            </div>

            {mode === 'create' && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Visibility</legend>
                <RadioGroup
                  value={visibility}
                  onValueChange={(v) => {
                    setVisibility(v as Visibility)
                    setVisibilityTouched(true)
                  }}
                  disabled={isPending}
                  className="flex flex-col gap-2 sm:flex-row sm:gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="draft" id="visibility-draft" />
                    <Label htmlFor="visibility-draft" className="font-normal">
                      Draft (hidden from public)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="published" id="visibility-published" />
                    <Label htmlFor="visibility-published" className="font-normal">
                      Published
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Drafts stay off the public calendar and iCal feed until you publish them from the
                  event page (or publish the whole season).
                </p>
              </fieldset>
            )}

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'edit' ? 'Saving…' : 'Creating…'}
                  </>
                ) : mode === 'edit' ? (
                  'Save Changes'
                ) : (
                  'Create Event'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(
                    mode === 'edit' && event ? `/admin/events/${event.id}` : '/admin/events'
                  )
                }
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
