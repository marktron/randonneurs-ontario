'use client'

import { useState, useTransition, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, X, Loader2, Check, Plus } from 'lucide-react'
import { createResult, updateResult, type ResultStatus } from '@/lib/actions/results'
import { SubmitResultsButton } from './submit-results-button'
import { AddRiderDialog } from './add-rider-dialog'
import { toast } from 'sonner'

interface Registration {
  id: string
  rider_id: string
  registered_at: string
  status: string
  notes: string | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
}

interface Result {
  id: string
  rider_id: string
  finish_time: string | null
  status: string
  team_name: string | null
  note: string | null
  riders: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
}

// Unified participant - either from registration or result-only
interface Participant {
  id: string // unique key for React (registration.id or 'result-' + result.id)
  riderId: string
  firstName: string
  lastName: string
  email: string | null
  hasRegistration: boolean
}

interface EventResultsManagerProps {
  eventId: string
  eventName: string
  eventStatus: string
  isPastEvent: boolean
  season: number
  distanceKm: number
  registrations: Registration[]
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
  season: number
  distanceKm: number
  onNoteClick: (riderId: string, riderName: string, currentNote: string) => void
}

function RiderRow({ participant, result, eventId, season, distanceKm, onNoteClick }: RiderRowProps) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<ResultStatus>(
    (result?.status as ResultStatus) || 'pending'
  )
  const [localTime, setLocalTime] = useState(result?.finish_time || '')
  const [showSaved, setShowSaved] = useState(false)

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
          teamName: null,
          note: null,
          season,
          distanceKm,
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
    if (!result || localTime === (result.finish_time || '')) return

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
        setLocalTime(result.finish_time || '')
      }
    })
  }

  const handleTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const hasNote = !!result?.note

  return (
    <TableRow className={isPending ? 'opacity-60' : undefined}>
      <TableCell className="font-medium">
        <div>
          {riderName}
          {participant.email && (
            <p className="text-xs text-muted-foreground">{participant.email}</p>
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
      <TableCell>
        <Button
          variant={hasNote ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => onNoteClick(participant.riderId, riderName, result?.note || '')}
          disabled={isPending || !result}
          title={result ? 'Add/edit note' : 'Set status first'}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : showSaved ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : result ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleStatusChange('pending')}
            title="Clear result"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

export function EventResultsManager({
  eventId,
  eventName,
  eventStatus,
  isPastEvent,
  season,
  distanceKm,
  registrations,
  results,
}: EventResultsManagerProps) {
  const [noteModal, setNoteModal] = useState<{
    riderId: string
    riderName: string
    note: string
  } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [isSavingNote, startSavingNote] = useTransition()
  const [addRiderOpen, setAddRiderOpen] = useState(false)

  // Create a map of rider_id -> result for quick lookup
  const resultsByRiderId = new Map(results.map((r) => [r.rider_id, r]))

  // Build unified participants list: registrations + results-only riders
  const registeredRiderIds = new Set(registrations.map((r) => r.rider_id))

  const participantsFromRegistrations: Participant[] = registrations.map((reg) => ({
    id: reg.id,
    riderId: reg.rider_id,
    firstName: reg.riders.first_name,
    lastName: reg.riders.last_name,
    email: reg.riders.email,
    hasRegistration: true,
  }))

  const participantsFromResultsOnly: Participant[] = results
    .filter((result) => !registeredRiderIds.has(result.rider_id))
    .map((result) => ({
      id: `result-${result.id}`,
      riderId: result.rider_id,
      firstName: result.riders.first_name,
      lastName: result.riders.last_name,
      email: result.riders.email,
      hasRegistration: false,
    }))

  const allParticipants = [...participantsFromRegistrations, ...participantsFromResultsOnly]

  // All rider IDs already in the event (for filtering in add rider dialog)
  const existingRiderIds = new Set(allParticipants.map((p) => p.riderId))

  const openNoteModal = (riderId: string, riderName: string, currentNote: string) => {
    setNoteModal({ riderId, riderName, note: currentNote })
    setNoteText(currentNote)
  }

  const handleSaveNote = () => {
    if (!noteModal) return

    const result = resultsByRiderId.get(noteModal.riderId)
    if (!result) return

    startSavingNote(async () => {
      const res = await updateResult(result.id, {
        status: result.status as ResultStatus,
        finishTime: result.finish_time,
        teamName: result.team_name,
        note: noteText || null,
      })
      if (res.success) {
        toast.success('Note saved')
        setNoteModal(null)
      } else {
        toast.error(res.error || 'Failed to save note')
      }
    })
  }

  // Sort by last name ascending
  const sortedParticipants = [...allParticipants].sort((a, b) => {
    const lastNameCompare = a.lastName.localeCompare(b.lastName)
    if (lastNameCompare !== 0) return lastNameCompare
    return a.firstName.localeCompare(b.firstName)
  })

  const completedCount = results.length
  const totalCount = allParticipants.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrations & Results</CardTitle>
        {isPastEvent && (
          <CardDescription>
            {completedCount} of {totalCount} riders have results entered
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
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
                    season={season}
                    distanceKm={distanceKm}
                    onNoteClick={openNoteModal}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Footer actions - Add Rider for past events, Submit for completed */}
      {isPastEvent && (
        <CardFooter className="border-t pt-6 flex gap-4">
          <Button variant="outline" onClick={() => setAddRiderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rider
          </Button>
          {eventStatus === 'completed' && (
            <SubmitResultsButton
              eventId={eventId}
              eventName={eventName}
              resultsCount={results.length}
            />
          )}
        </CardFooter>
      )}

      {/* Add Rider Dialog */}
      <AddRiderDialog
        open={addRiderOpen}
        onOpenChange={setAddRiderOpen}
        eventId={eventId}
        season={season}
        distanceKm={distanceKm}
        existingRiderIds={existingRiderIds}
      />

      {/* Note Modal */}
      <Dialog open={!!noteModal} onOpenChange={(open) => !open && setNoteModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Note for {noteModal?.riderName}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this rider's result..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNote} disabled={isSavingNote}>
              {isSavingNote ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Note'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
