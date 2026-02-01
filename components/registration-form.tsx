'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { registerForEvent, completeRegistrationWithRider } from '@/lib/actions/register'
import { RiderMatchDialog } from '@/components/rider-match-dialog'
import type { RiderMatchCandidate } from '@/lib/actions/rider-match'
import { getUpcomingEventsByEventId, type UpcomingEvent } from '@/lib/actions/rider-results'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { MembershipErrorModal } from '@/components/membership-error-modal'

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

interface RegistrationFormProps {
  eventId: string
  isPermanent?: boolean
  /** "card" shows border/title container, "plain" for use in modals */
  variant?: 'card' | 'plain'
}

export function RegistrationForm({
  eventId,
  isPermanent,
  variant = 'card',
}: RegistrationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [shareRegistration, setShareRegistration] = useState(false)
  const [gender, setGender] = useState<string>('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Membership error state
  const [membershipErrorVariant, setMembershipErrorVariant] = useState<
    'no-membership' | 'trial-used' | null
  >(null)

  // Fuzzy matching state
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState<RiderMatchCandidate[]>([])
  const [pendingNotes, setPendingNotes] = useState<string>('')

  // Upcoming events state
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const notes = formData.get('notes') as string

    startTransition(async () => {
      const result = await registerForEvent({
        eventId,
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

        // Fetch upcoming events for non-permanents
        if (!isPermanent) {
          setLoadingEvents(true)
          getUpcomingEventsByEventId(eventId, 3)
            .then((eventsResult) => {
              if (eventsResult.success && eventsResult.data) {
                setUpcomingEvents(eventsResult.data)
              }
            })
            .catch(() => {
              // Silently fail - the events are a nice-to-have
            })
            .finally(() => {
              setLoadingEvents(false)
            })
        }
      } else if (result.needsRiderMatch && result.matchCandidates) {
        // Show fuzzy matching dialog
        setMatchCandidates(result.matchCandidates)
        setPendingNotes(notes || '')
        setMatchDialogOpen(true)
      } else if (result.membershipError) {
        setMembershipErrorVariant(result.membershipError)
      } else {
        setError(result.error || 'Registration failed')
      }
    })
  }

  async function handleRiderSelection(riderId: string | null) {
    startTransition(async () => {
      const result = await completeRegistrationWithRider({
        eventId,
        selectedRiderId: riderId,
        firstName,
        lastName,
        email,
        gender: gender || undefined,
        shareRegistration,
        notes: pendingNotes || undefined,
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

        // Fetch upcoming events for non-permanents
        if (!isPermanent) {
          setLoadingEvents(true)
          getUpcomingEventsByEventId(eventId, 3)
            .then((eventsResult) => {
              if (eventsResult.success && eventsResult.data) {
                setUpcomingEvents(eventsResult.data)
              }
            })
            .catch(() => {
              // Silently fail - the events are a nice-to-have
            })
            .finally(() => {
              setLoadingEvents(false)
            })
        }
      } else {
        setMatchDialogOpen(false)
        setError(result.error || 'Registration failed')
      }
    })
  }

  const wrapperClassName =
    variant === 'card'
      ? 'lg:sticky lg:top-24 rounded-2xl border border-border bg-card p-6 md:p-8'
      : undefined

  if (success) {
    return (
      <div className={wrapperClassName}>
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
          <h2 className="font-serif text-2xl tracking-tight mb-2">You're registered!</h2>
          <p className="text-sm text-muted-foreground">See you at the start line.</p>
        </div>

        {/* Upcoming Events Section */}
        {loadingEvents && (
          <div className="border-t border-border pt-6 mt-6">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Loading upcoming events…
            </div>
          </div>
        )}

        {!loadingEvents && upcomingEvents.length > 0 && (
          <div className="border-t border-border pt-6 mt-6">
            <h3 className="font-medium text-sm mb-4 text-center">More Upcoming Events</h3>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <UpcomingEventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={wrapperClassName}>
      {variant === 'card' && <h2 className="font-serif text-2xl tracking-tight mb-6">Register</h2>}

      {isPermanent && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-sm">
          <p className="font-medium mb-1">This is a Permanent</p>
          <p className="text-muted-foreground">
            Join this rider on their scheduled permanent ride, or{' '}
            <Link
              href="/register/permanent"
              className="text-primary hover:underline underline-offset-2"
            >
              schedule your own
            </Link>
            .
          </p>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
            data-testid="registration-error"
          >
            {error}
          </div>
        )}

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
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isPending}
          data-testid="registration-submit"
        >
          {isPending ? 'Registering…' : 'Register'}
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

      <MembershipErrorModal
        open={membershipErrorVariant !== null}
        onClose={() => setMembershipErrorVariant(null)}
        variant={membershipErrorVariant || 'no-membership'}
      />
    </div>
  )
}

interface UpcomingEventCardProps {
  event: UpcomingEvent
}

function UpcomingEventCard({ event }: UpcomingEventCardProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex-shrink-0 text-center w-14">
        <div className="text-xs text-muted-foreground uppercase">
          {format(new Date(event.date + 'T00:00:00'), 'MMM')}
        </div>
        <div className="text-lg font-medium tabular-nums">
          {format(new Date(event.date + 'T00:00:00'), 'd')}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{event.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{event.distance} km</div>
        {event.startLocation && (
          <div className="text-xs text-muted-foreground truncate">{event.startLocation}</div>
        )}
      </div>
      <Link
        href={`/register/${event.slug}`}
        className="flex-shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        Register
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
