'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { registerForPermanent, completeRegistrationWithRider } from '@/lib/actions/register'
import { RiderMatchDialog } from '@/components/rider-match-dialog'
import type { RiderMatchCandidate } from '@/lib/actions/rider-match'
import type { ActiveRoute } from '@/lib/data/routes'

const STORAGE_KEY = 'ro-registration'

interface SavedRegistrationData {
  firstName: string
  lastName: string
  email: string
  gender: string
  shareRegistration: boolean
  emergencyContactName: string
  emergencyContactPhone: string
}

function getSavedData(): SavedRegistrationData | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveData(data: SavedRegistrationData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}

// Minimum date is 2 weeks from today
const minDate = addDays(startOfDay(new Date()), 14)

interface PermanentRegistrationFormProps {
  routes: ActiveRoute[]
}

export function PermanentRegistrationForm({ routes }: PermanentRegistrationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Route/schedule fields
  const [routeId, setRouteId] = useState<string>('')
  const [routePickerOpen, setRoutePickerOpen] = useState(false)
  const [eventDate, setEventDate] = useState<Date | undefined>(undefined)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [startTime, setStartTime] = useState<string>('08:00')
  const [startLocation, setStartLocation] = useState<string>('')
  const [direction, setDirection] = useState<'as_posted' | 'reversed'>('as_posted')

  // Rider fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [shareRegistration, setShareRegistration] = useState(false)
  const [gender, setGender] = useState<string>('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [notes, setNotes] = useState('')

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Fuzzy matching state
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState<RiderMatchCandidate[]>([])
  const [pendingEventId, setPendingEventId] = useState<string>('')

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

  // Load saved data on mount
  useEffect(() => {
    const saved = getSavedData()
    if (saved) {
      setFirstName(saved.firstName)
      setLastName(saved.lastName)
      setEmail(saved.email)
      setGender(saved.gender)
      setShareRegistration(saved.shareRegistration)
      setEmergencyContactName(saved.emergencyContactName || '')
      setEmergencyContactPhone(saved.emergencyContactPhone || '')
    }
  }, [])

  const selectedRoute = routes.find((r) => r.id === routeId)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!routeId) {
      setError('Please select a route')
      return
    }

    if (!eventDate) {
      setError('Please select a date')
      return
    }

    // Format date as YYYY-MM-DD for the server
    const formattedDate = format(eventDate, 'yyyy-MM-dd')

    startTransition(async () => {
      const result = await registerForPermanent({
        routeId,
        eventDate: formattedDate,
        startTime,
        startLocation: startLocation.trim(),
        direction,
        firstName,
        lastName,
        email,
        gender: gender || undefined,
        shareRegistration,
        notes: notes || undefined,
        emergencyContactName,
        emergencyContactPhone,
      })

      if (result.success) {
        // Save form data to localStorage for next registration
        saveData({
          firstName,
          lastName,
          email,
          gender,
          shareRegistration,
          emergencyContactName,
          emergencyContactPhone,
        })
        setSuccess(true)
        router.refresh()
      } else if (result.needsRiderMatch && result.matchCandidates && result.pendingData) {
        // Show fuzzy matching dialog
        setMatchCandidates(result.matchCandidates)
        setPendingEventId(result.pendingData.eventId)
        setMatchDialogOpen(true)
      } else {
        setError(result.error || 'Registration failed')
      }
    })
  }

  async function handleRiderSelection(riderId: string | null) {
    startTransition(async () => {
      const result = await completeRegistrationWithRider({
        eventId: pendingEventId,
        selectedRiderId: riderId,
        firstName,
        lastName,
        email,
        gender: gender || undefined,
        shareRegistration,
        notes: notes || undefined,
        emergencyContactName,
        emergencyContactPhone,
      })

      if (result.success) {
        setMatchDialogOpen(false)
        saveData({
          firstName,
          lastName,
          email,
          gender,
          shareRegistration,
          emergencyContactName,
          emergencyContactPhone,
        })
        setSuccess(true)
        router.refresh()
      } else {
        setMatchDialogOpen(false)
        setError(result.error || 'Registration failed')
      }
    })
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="text-center py-8" data-testid="registration-success">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <svg
              className="w-6 h-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="font-serif text-2xl mb-2">You&apos;re registered!</h2>
          <p className="text-sm text-muted-foreground">
            Your permanent ride has been scheduled. You&apos;ll receive a confirmation email
            shortly.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <h2 className="font-serif text-2xl mb-6">Schedule Your Ride</h2>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
            data-testid="registration-error"
          >
            {error}
          </div>
        )}

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
                  variant="outline"
                  role="combobox"
                  aria-expanded={routePickerOpen}
                  disabled={isPending}
                  className="w-full justify-between font-normal"
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
                  className="w-full justify-between font-normal"
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
                  defaultMonth={minDate}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Must be at least 2 weeks from today</p>
          </div>

          {/* Time Picker */}
          <div className="space-y-2">
            <Label htmlFor="time">Start Time</Label>
            <Input
              id="time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          {/* Start Location */}
          <div className="space-y-2">
            <Label htmlFor="location">
              Alternate Start Location
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Input
              id="location"
              type="text"
              placeholder="e.g., Tim Hortons, 123 Main St, Toronto"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Only needed if you&apos;re not starting at the route&apos;s planned start control
            </p>
          </div>

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

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                placeholder="First"
                required
                disabled={isPending}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Last"
                required
                disabled={isPending}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              disabled={isPending}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <Label htmlFor="gender">
              Gender
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Select
              key={gender || 'empty'}
              value={gender}
              onValueChange={setGender}
              disabled={isPending}
            >
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Male</SelectItem>
                <SelectItem value="F">Female</SelectItem>
                <SelectItem value="X">Non-binary / Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Audax Club Parisien uses this for ridership statistics.
            </p>
          </div>

          {/* Share Registration */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="share"
                checked={shareRegistration}
                onCheckedChange={(checked) => setShareRegistration(checked === true)}
                className="mt-0.5"
                disabled={isPending}
              />
              <div className="space-y-1">
                <Label htmlFor="share" className="cursor-pointer">
                  Share my registration
                </Label>
                <p className="text-xs text-muted-foreground">
                  Share your name with other riders before the event. All riders will appear on the
                  results after the event.
                </p>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">Emergency contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyContactName">Name</Label>
                <Input
                  id="emergencyContactName"
                  name="emergencyContactName"
                  type="text"
                  placeholder="Name"
                  required
                  disabled={isPending}
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyContactPhone">Phone</Label>
                <Input
                  id="emergencyContactPhone"
                  name="emergencyContactPhone"
                  type="tel"
                  placeholder="Phone number"
                  required
                  disabled={isPending}
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes for the organizer
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Any special requirements or information…"
              rows={3}
              disabled={isPending}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isPending}
          data-testid="registration-submit"
        >
          {isPending ? 'Scheduling…' : 'Schedule Permanent'}
        </Button>
      </form>

      <RiderMatchDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        candidates={matchCandidates}
        submittedFirstName={firstName}
        submittedLastName={lastName}
        onSelectRider={(riderId) => handleRiderSelection(riderId)}
        onCreateNew={() => handleRiderSelection(null)}
        isPending={isPending}
      />
    </div>
  )
}
