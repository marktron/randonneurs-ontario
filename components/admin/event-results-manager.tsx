'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Check,
  Plus,
  CheckCircle2,
  Globe,
  FileText,
  Mail,
  UserX,
  Trash2,
  RefreshCw,
  Clipboard,
  ClipboardCheck,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  createResult,
  updateResult,
  deleteResult,
  updateRegistrationTeamName,
  adminCancelRegistration,
  revalidateMembership,
  type ResultStatus,
} from '@/lib/actions/results'
import { formatFinishTime, buildParticipantMailtoUrl } from '@/lib/utils'
import { SubmitResultsButton } from './submit-results-button'
import { AddRiderDialog } from './add-rider-dialog'
import { toast } from 'sonner'

interface Registration {
  id: string
  rider_id: string
  registered_at: string | null
  status: string | null
  notes: string | null
  team_name: string | null
  is_team_captain: boolean | null
  share_registration: boolean | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
    rider_memberships?: Array<{ membership_type: string; season: number }> | null
  } | null
}

interface Result {
  id: string
  rider_id: string
  finish_time: string | null
  status: string | null
  team_name: string | null
  distance_km: number
  note: string | null
  // Rider submission fields
  gpx_url: string | null
  gpx_file_path: string | null
  control_card_front_path: string | null
  control_card_back_path: string | null
  rider_notes: string | null
  submitted_at: string | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  } | null
}

// Unified participant - either from registration or result-only
interface Participant {
  id: string // unique key for React (registration.id or 'result-' + result.id)
  riderId: string
  firstName: string
  lastName: string
  email: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  registrationNotes: string | null
  hasRegistration: boolean
  registrationStatus: string | null
  membershipType: string | null // membership type for event's season, if any
  registrationTeamName: string | null
  isTeamCaptain: boolean | null
  shareRegistration: boolean | null
}

interface CancelledRegistration {
  id: string
  rider_id: string
  cancelled_at: string | null
  riders: {
    first_name: string
    last_name: string
    email: string | null
  } | null
}

interface EventResultsManagerProps {
  eventId: string
  eventName: string
  eventDate: string
  eventType: string
  eventStatus: string | null
  isPastEvent: boolean
  season: number | null
  distanceKm: number
  registrations: Registration[]
  cancelledRegistrations: CancelledRegistration[]
  results: Result[]
}

const STATUS_OPTIONS: { value: ResultStatus; label: string }[] = [
  { value: 'pending', label: '—' },
  { value: 'finished', label: 'Finished' },
  { value: 'dnf', label: 'DNF' },
  { value: 'dns', label: 'DNS' },
  { value: 'otl', label: 'OTL' },
  { value: 'dq', label: 'DQ' },
]

interface RiderRowProps {
  participant: Participant
  result: Result | null
  eventId: string
  eventType: string
  eventStatus: string | null
  season: number | null
  distanceKm: number
  registrationId: string | null
  onRegistrationCancelled: (
    registrationId: string,
    riderName: string,
    riderEmail: string | null
  ) => void
}

function DeleteResultButton({
  resultId,
  riderName,
  riderEmail,
  isPending,
  registrationId,
  onRegistrationCancelled,
}: {
  resultId: string
  riderName: string
  riderEmail: string | null
  isPending: boolean
  registrationId: string | null
  onRegistrationCancelled: (id: string, name: string, email: string | null) => void
}) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title="Delete result"
          disabled={isPending || deleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete result?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{riderName}</strong>&apos;s registration and result from the
            event. They will not appear as DNS on the website.
            <br />
            <br />
            Use this if the rider cancelled with the organizer but did not cancel their registration
            online.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              startDelete(async () => {
                const res = await deleteResult(resultId)
                if (!res.success) {
                  toast.error(res.error || 'Failed to delete result')
                  return
                }
                if (registrationId) {
                  const regRes = await adminCancelRegistration(registrationId)
                  if (regRes.success) {
                    onRegistrationCancelled(registrationId, riderName, riderEmail)
                  }
                }
                toast.success(`Result deleted for ${riderName}`)
                router.refresh()
              })
            }}
          >
            Delete Result
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RiderRow({
  participant,
  result,
  eventId,
  eventType,
  eventStatus,
  season,
  distanceKm,
  registrationId,
  onRegistrationCancelled,
}: RiderRowProps) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<ResultStatus>(
    (result?.status as ResultStatus) || 'pending'
  )
  const [localTime, setLocalTime] = useState(formatFinishTime(result?.finish_time ?? null))
  const [localTeamName, setLocalTeamName] = useState(
    result?.team_name ?? participant.registrationTeamName ?? ''
  )
  const [localDistance, setLocalDistance] = useState(
    result?.distance_km?.toString() ?? distanceKm.toString()
  )
  const [showSaved, setShowSaved] = useState(false)
  const isFleche = eventType === 'fleche'

  const riderName = `${participant.firstName} ${participant.lastName}`

  const flashSaved = useCallback(() => {
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1500)
  }, [])

  const handleStatusChange = (newStatus: ResultStatus) => {
    setLocalStatus(newStatus)

    // Create or update result
    startTransition(async () => {
      if (result) {
        const res = await updateResult(result.id, {
          status: newStatus,
          finishTime: newStatus === 'finished' ? localTime || null : null,
          teamName: result.team_name,
          note: result.note,
        })
        if (res.success) {
          flashSaved()
          if (newStatus !== 'finished') setLocalTime('')
        } else {
          toast.error(res.error || 'Failed to update result')
          setLocalStatus(result.status as ResultStatus)
        }
      } else {
        const res = await createResult({
          eventId,
          riderId: participant.riderId,
          status: newStatus,
          finishTime: newStatus === 'finished' ? localTime || null : null,
          teamName: localTeamName || null,
          note: null,
          season: season ?? new Date().getFullYear(),
          distanceKm:
            isFleche && localDistance ? parseFloat(localDistance) || distanceKm : distanceKm,
        })
        if (res.success) {
          flashSaved()
        } else {
          toast.error(res.error || 'Failed to create result')
          setLocalStatus('pending')
        }
      }
    })
  }

  const handleTimeBlur = () => {
    if (!result || localTime === formatFinishTime(result.finish_time)) return

    startTransition(async () => {
      const res = await updateResult(result.id, {
        status: result.status as ResultStatus,
        finishTime: localTime || null,
        teamName: result.team_name,
        note: result.note,
      })
      if (res.success) {
        flashSaved()
      } else {
        toast.error(res.error || 'Failed to update time')
        setLocalTime(formatFinishTime(result.finish_time))
      }
    })
  }

  const handleTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const handleTeamNameBlur = () => {
    if (result) {
      // Update the result record
      if (localTeamName === (result.team_name ?? '')) return

      startTransition(async () => {
        const res = await updateResult(result.id, {
          status: result.status as ResultStatus,
          finishTime: result.finish_time,
          teamName: localTeamName || null,
          note: result.note,
        })
        if (res.success) {
          flashSaved()
        } else {
          toast.error(res.error || 'Failed to update team name')
          setLocalTeamName(result.team_name ?? '')
        }
      })
    } else if (registrationId) {
      // No result yet — update the registration record
      if (localTeamName === (participant.registrationTeamName ?? '')) return

      startTransition(async () => {
        const res = await updateRegistrationTeamName(registrationId, localTeamName || null)
        if (res.success) {
          flashSaved()
        } else {
          toast.error(res.error || 'Failed to update team name')
          setLocalTeamName(participant.registrationTeamName ?? '')
        }
      })
    }
  }

  const handleDistanceBlur = () => {
    if (!result) return
    const newDistance = parseFloat(localDistance)
    if (isNaN(newDistance) || newDistance === result.distance_km) return

    startTransition(async () => {
      const res = await updateResult(result.id, {
        status: result.status as ResultStatus,
        finishTime: result.finish_time,
        teamName: result.team_name,
        note: result.note,
        distanceKm: newDistance,
      })
      if (res.success) {
        flashSaved()
      } else {
        toast.error(res.error || 'Failed to update distance')
        setLocalDistance(result.distance_km.toString())
      }
    })
  }

  return (
    <TableRow className={isPending ? 'opacity-60' : undefined}>
      <TableCell className="font-medium">
        <div>
          <div className="flex items-center flex-wrap gap-1">
            <Link href={`/admin/riders/${participant.riderId}`} className="hover:underline">
              {riderName}
            </Link>
            {participant.registrationStatus === 'incomplete: membership' && registrationId && (
              <Badge
                variant="destructive"
                className="ml-1 cursor-pointer"
                onClick={() => {
                  startTransition(async () => {
                    const res = await revalidateMembership(registrationId)
                    if (!res.success) {
                      toast.error(res.error || 'Failed to check membership')
                    } else if (res.data?.membershipFound) {
                      toast.success('Membership found — registration updated')
                    } else {
                      toast.info('Membership still not found in CCN')
                    }
                  })
                }}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isPending ? 'animate-spin' : ''}`} />
                Missing membership
              </Badge>
            )}
            {participant.registrationStatus === 'incomplete: membership' && !registrationId && (
              <Badge variant="destructive" className="ml-1">
                Missing membership
              </Badge>
            )}
            {participant.hasRegistration &&
              participant.registrationStatus === 'registered' &&
              participant.membershipType === 'Trial Member' && (
                <Badge variant="secondary" className="ml-1">
                  Trial
                </Badge>
              )}
            {isFleche && participant.isTeamCaptain && (
              <Badge variant="outline" className="ml-1">
                Captain
              </Badge>
            )}
            {participant.hasRegistration && participant.shareRegistration === false && (
              <Badge variant="outline" className="ml-1">
                Anonymous registration
              </Badge>
            )}
          </div>
          {participant.email && (
            <p className="text-xs text-muted-foreground">{participant.email}</p>
          )}
          {isFleche && participant.registrationTeamName && (
            <p className="text-xs text-muted-foreground">
              Registered team: {participant.registrationTeamName}
            </p>
          )}
          {participant.emergencyContactName && (
            <p className="text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="underline decoration-dotted underline-offset-2 cursor-help">
                    ICE
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>In Case of Emergency</p>
                </TooltipContent>
              </Tooltip>
              : {participant.emergencyContactName}
              {participant.emergencyContactPhone && ` (${participant.emergencyContactPhone})`}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={localStatus}
          onValueChange={(v) => handleStatusChange(v as ResultStatus)}
          disabled={isPending}
        >
          <SelectTrigger className="w-[110px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="text"
          placeholder="HH:MM"
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          onBlur={handleTimeBlur}
          onKeyDown={handleTimeKeyDown}
          disabled={isPending || localStatus !== 'finished'}
          className="w-[80px] h-8 font-mono"
        />
      </TableCell>
      {isFleche && (
        <>
          <TableCell>
            <Input
              type="text"
              placeholder="Team name"
              value={localTeamName}
              onChange={(e) => setLocalTeamName(e.target.value)}
              onBlur={handleTeamNameBlur}
              onKeyDown={handleTimeKeyDown}
              disabled={isPending}
              className="w-[140px] h-8"
            />
          </TableCell>
          <TableCell>
            <Input
              type="text"
              placeholder="km"
              value={localDistance}
              onChange={(e) => setLocalDistance(e.target.value)}
              onBlur={handleDistanceBlur}
              onKeyDown={handleTimeKeyDown}
              disabled={isPending}
              className="w-[80px] h-8 font-mono"
            />
          </TableCell>
        </>
      )}
      <TableCell>
        {/* Evidence - Strava/GPX links, Control Card thumbnails */}
        {result &&
        (result.gpx_url ||
          result.gpx_file_path ||
          result.control_card_front_path ||
          result.control_card_back_path) ? (
          <div className="flex items-center gap-1.5">
            {result.gpx_url && (
              <a
                href={result.gpx_url}
                target="_blank"
                rel="noopener noreferrer"
                title="View Strava/GPS activity"
                className="text-muted-foreground hover:text-primary"
              >
                <Globe className="h-5 w-5" />
              </a>
            )}
            {result.gpx_file_path && (
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${result.gpx_file_path}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Download GPX file"
                className="text-muted-foreground hover:text-primary"
              >
                <FileText className="h-4 w-4" />
              </a>
            )}
            {result.control_card_front_path && (
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${result.control_card_front_path}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Control card front"
                className="block"
              >
                <Image
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${result.control_card_front_path}`}
                  alt="Control card front"
                  width={32}
                  height={32}
                  className="object-cover rounded border border-border hover:border-primary transition-colors"
                  unoptimized
                />
              </a>
            )}
            {result.control_card_back_path && (
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${result.control_card_back_path}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Control card back"
                className="block"
              >
                <Image
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${result.control_card_back_path}`}
                  alt="Control card back"
                  width={32}
                  height={32}
                  className="object-cover rounded border border-border hover:border-primary transition-colors"
                  unoptimized
                />
              </a>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[300px] whitespace-normal break-words">
        {participant.registrationNotes && (
          <p className="text-muted-foreground">{participant.registrationNotes}</p>
        )}
        {result?.rider_notes && <p className="text-muted-foreground">{result.rider_notes}</p>}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : showSaved ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : null}
          {registrationId &&
            participant.hasRegistration &&
            (participant.registrationStatus === 'registered' ||
              participant.registrationStatus === 'incomplete: membership') &&
            (eventStatus === 'scheduled' || eventStatus === 'completed') &&
            !result && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Cancel registration"
                    disabled={isPending}
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel registration?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the registration for <strong>{riderName}</strong>. The rider
                      will no longer appear in the registration list.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await adminCancelRegistration(registrationId)
                          if (res.success) {
                            onRegistrationCancelled(registrationId, riderName, participant.email)
                            toast.success(`Registration cancelled for ${riderName}`)
                          } else {
                            toast.error(res.error || 'Failed to cancel registration')
                          }
                        })
                      }}
                    >
                      Cancel Registration
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          {result && eventStatus === 'completed' && (
            <DeleteResultButton
              resultId={result.id}
              riderName={riderName}
              riderEmail={participant.email}
              isPending={isPending}
              registrationId={registrationId}
              onRegistrationCancelled={onRegistrationCancelled}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function EventResultsManager({
  eventId,
  eventName,
  eventDate,
  eventType,
  eventStatus,
  isPastEvent,
  season,
  distanceKm,
  registrations,
  cancelledRegistrations: initialCancelledRegistrations,
  results,
}: EventResultsManagerProps) {
  const isFleche = eventType === 'fleche'
  const [addRiderOpen, setAddRiderOpen] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(eventStatus === 'submitted')
  const [cancelledRegistrationIds, setCancelledRegistrationIds] = useState<Set<string>>(new Set())
  const [localCancelled, setLocalCancelled] = useState<CancelledRegistration[]>([])

  const handleRegistrationCancelled = useCallback(
    (registrationId: string, riderName: string, riderEmail: string | null) => {
      setCancelledRegistrationIds((prev) => new Set([...prev, registrationId]))
      const [firstName, ...lastParts] = riderName.split(' ')
      const lastName = lastParts.join(' ')
      setLocalCancelled((prev) => [
        ...prev,
        {
          id: registrationId,
          rider_id: '',
          cancelled_at: new Date().toISOString(),
          riders: { first_name: firstName, last_name: lastName, email: riderEmail },
        },
      ])
    },
    []
  )

  // Create a map of rider_id -> result for quick lookup
  const resultsByRiderId = new Map(results.map((r) => [r.rider_id, r]))

  // Build unified participants list: registrations + results-only riders
  const registeredRiderIds = new Set(registrations.map((r) => r.rider_id))

  const participantsFromRegistrations: Participant[] = registrations
    .filter((reg) => reg.riders && !cancelledRegistrationIds.has(reg.id))
    .map((reg) => {
      const currentMembership = reg.riders!.rider_memberships?.find((m) => m.season === season)
      return {
        id: reg.id,
        riderId: reg.rider_id,
        firstName: reg.riders!.first_name,
        lastName: reg.riders!.last_name,
        email: reg.riders!.email,
        emergencyContactName: reg.riders!.emergency_contact_name,
        emergencyContactPhone: reg.riders!.emergency_contact_phone,
        registrationNotes: reg.notes,
        hasRegistration: true,
        registrationStatus: reg.status,
        membershipType: currentMembership?.membership_type ?? null,
        registrationTeamName: reg.team_name,
        isTeamCaptain: reg.is_team_captain,
        shareRegistration: reg.share_registration,
      }
    })

  const participantsFromResultsOnly: Participant[] = results
    .filter((result) => !registeredRiderIds.has(result.rider_id) && result.riders)
    .map((result) => ({
      id: `result-${result.id}`,
      riderId: result.rider_id,
      firstName: result.riders!.first_name,
      lastName: result.riders!.last_name,
      email: result.riders!.email,
      emergencyContactName: null,
      emergencyContactPhone: null,
      registrationNotes: null,
      hasRegistration: false,
      registrationStatus: null,
      membershipType: null,
      registrationTeamName: null,
      isTeamCaptain: false,
      shareRegistration: null,
    }))

  const allParticipants = [...participantsFromRegistrations, ...participantsFromResultsOnly]

  // All rider IDs already in the event (for filtering in add rider dialog)
  const existingRiderIds = new Set(allParticipants.map((p) => p.riderId))

  // Sort participants: for fleche, group by team name first, then by last name
  const sortedParticipants = [...allParticipants].sort((a, b) => {
    if (isFleche) {
      const aTeam = a.registrationTeamName ?? resultsByRiderId.get(a.riderId)?.team_name ?? ''
      const bTeam = b.registrationTeamName ?? resultsByRiderId.get(b.riderId)?.team_name ?? ''
      const teamCompare = aTeam.localeCompare(bTeam)
      if (teamCompare !== 0) return teamCompare
    }
    const lastNameCompare = a.lastName.localeCompare(b.lastName)
    if (lastNameCompare !== 0) return lastNameCompare
    return a.firstName.localeCompare(b.firstName)
  })

  const completedCount = results.filter((r) => r.status && r.status !== 'pending').length
  const totalCount = allParticipants.length

  const participantEmails = allParticipants
    .map((p) => p.email)
    .filter((email): email is string => email !== null)
  const mailtoUrl = buildParticipantMailtoUrl(participantEmails, eventName, eventDate)

  const [copied, setCopied] = useState(false)

  const handleCopyRiderInfo = useCallback(async () => {
    const lines: string[] = [
      `${eventName}`,
      `${eventDate} — ${distanceKm}km ${eventType}`,
      '',
      `Riders (${sortedParticipants.length})`,
      '—'.repeat(40),
    ]

    for (const p of sortedParticipants) {
      const name = `${p.firstName} ${p.lastName}`
      lines.push(name)
      if (p.email) lines.push(p.email)
      if (p.emergencyContactName || p.emergencyContactPhone) {
        const ice = [p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(' ')
        lines.push(`Emergency Contact: ${ice}`)
      }
      lines.push('')
    }

    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [eventName, eventDate, distanceKm, eventType, sortedParticipants])

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Registrations & Results</CardTitle>
          {isPastEvent && (
            <CardDescription>
              {completedCount} of {totalCount} riders have results entered
            </CardDescription>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sortedParticipants.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleCopyRiderInfo}>
              {copied ? (
                <ClipboardCheck className="mr-2 h-4 w-4" />
              ) : (
                <Clipboard className="mr-2 h-4 w-4" />
              )}
              {copied ? 'Copied!' : 'Copy rider info'}
            </Button>
          )}
          {mailtoUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={mailtoUrl}>
                <Mail className="mr-2 h-4 w-4" />
                Email Participants
              </a>
            </Button>
          )}
          {(eventStatus === 'scheduled' ||
            eventStatus === 'completed' ||
            eventStatus === 'submitted') && (
            <Button variant="outline" size="sm" onClick={() => setAddRiderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rider
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSubmitted && (
          <Alert className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-800 dark:text-green-300">
              {eventType === 'permanent' ? 'Results Finalized' : 'Results Submitted'}
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-400">
              {eventType === 'permanent'
                ? 'Results have been finalized and recorded.'
                : 'Results have been emailed to the VP of Brevet Administration for recording.'}
            </AlertDescription>
          </Alert>
        )}
        {allParticipants.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No riders registered or results recorded for this event yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  {isFleche && <TableHead>Team</TableHead>}
                  {isFleche && <TableHead>Distance</TableHead>}
                  <TableHead>Evidence</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedParticipants.map((participant) => (
                  <RiderRow
                    key={participant.id}
                    participant={participant}
                    result={resultsByRiderId.get(participant.riderId) || null}
                    eventId={eventId}
                    eventType={eventType}
                    eventStatus={eventStatus}
                    season={season}
                    distanceKm={distanceKm}
                    registrationId={participant.hasRegistration ? participant.id : null}
                    onRegistrationCancelled={handleRegistrationCancelled}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Cancelled registrations section */}
        {(() => {
          const allCancelled = [
            ...initialCancelledRegistrations.filter(
              (c) => !localCancelled.some((lc) => lc.id === c.id)
            ),
            ...localCancelled,
          ]
          if (allCancelled.length === 0) return null
          return (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Cancelled ({allCancelled.length})
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rider</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cancelled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCancelled.map((reg) => (
                      <TableRow key={reg.id} className="text-muted-foreground">
                        <TableCell>
                          {reg.riders
                            ? `${reg.riders.first_name} ${reg.riders.last_name}`
                            : 'Unknown rider'}
                        </TableCell>
                        <TableCell>{reg.riders?.email ?? '—'}</TableCell>
                        <TableCell>
                          {reg.cancelled_at
                            ? new Date(reg.cancelled_at).toLocaleDateString('en-CA', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )
        })()}
      </CardContent>

      {/* Footer actions - Submit for completed events */}
      {eventStatus === 'completed' && !isSubmitted && (
        <CardFooter className="border-t pt-6">
          <SubmitResultsButton
            eventId={eventId}
            eventName={eventName}
            eventType={eventType}
            resultsCount={results.length}
            onSuccess={() => setIsSubmitted(true)}
          />
        </CardFooter>
      )}

      {/* Add Rider Dialog */}
      <AddRiderDialog
        open={addRiderOpen}
        onOpenChange={setAddRiderOpen}
        eventId={eventId}
        eventStatus={eventStatus}
        season={season}
        distanceKm={distanceKm}
        existingRiderIds={existingRiderIds}
      />
    </Card>
  )
}
