'use client'

import { useState, useTransition } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Trash2, Loader2, Clock } from 'lucide-react'
import { createResult, updateResult, deleteResult, type ResultStatus } from '@/lib/actions/results'
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
  }
}

interface EventResultsManagerProps {
  eventId: string
  season: number
  distanceKm: number
  registrations: Registration[]
  results: Result[]
}

const STATUS_OPTIONS: { value: ResultStatus; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'dnf', label: 'DNF (Did Not Finish)' },
  { value: 'dns', label: 'DNS (Did Not Start)' },
  { value: 'otl', label: 'OTL (Outside Time Limit)' },
  { value: 'dq', label: 'DQ (Disqualified)' },
]

export function EventResultsManager({
  eventId,
  season,
  distanceKm,
  registrations,
  results,
}: EventResultsManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [selectedResult, setSelectedResult] = useState<Result | null>(null)

  // Form state
  const [finishTime, setFinishTime] = useState('')
  const [status, setStatus] = useState<ResultStatus>('finished')
  const [teamName, setTeamName] = useState('')
  const [note, setNote] = useState('')

  const resetForm = () => {
    setFinishTime('')
    setStatus('finished')
    setTeamName('')
    setNote('')
  }

  const openAddDialog = (registration: Registration) => {
    setSelectedRegistration(registration)
    resetForm()
    setIsAddDialogOpen(true)
  }

  const openEditDialog = (result: Result) => {
    setSelectedResult(result)
    setFinishTime(result.finish_time || '')
    setStatus(result.status as ResultStatus)
    setTeamName(result.team_name || '')
    setNote(result.note || '')
    setIsEditDialogOpen(true)
  }

  const handleAddResult = () => {
    if (!selectedRegistration) return

    startTransition(async () => {
      const result = await createResult({
        eventId,
        riderId: selectedRegistration.rider_id,
        finishTime: finishTime || null,
        status,
        teamName: teamName || null,
        note: note || null,
        season,
        distanceKm,
      })

      if (result.success) {
        toast.success('Result added successfully')
        setIsAddDialogOpen(false)
        resetForm()
      } else {
        toast.error(result.error || 'Failed to add result')
      }
    })
  }

  const handleUpdateResult = () => {
    if (!selectedResult) return

    startTransition(async () => {
      const result = await updateResult(selectedResult.id, {
        finishTime: finishTime || null,
        status,
        teamName: teamName || null,
        note: note || null,
      })

      if (result.success) {
        toast.success('Result updated successfully')
        setIsEditDialogOpen(false)
      } else {
        toast.error(result.error || 'Failed to update result')
      }
    })
  }

  const handleDeleteResult = (resultId: string) => {
    if (!confirm('Are you sure you want to delete this result?')) return

    startTransition(async () => {
      const result = await deleteResult(resultId)

      if (result.success) {
        toast.success('Result deleted successfully')
      } else {
        toast.error(result.error || 'Failed to delete result')
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finished':
        return <Badge>Finished</Badge>
      case 'dnf':
        return <Badge variant="secondary">DNF</Badge>
      case 'dns':
        return <Badge variant="outline">DNS</Badge>
      case 'otl':
        return <Badge variant="secondary">OTL</Badge>
      case 'dq':
        return <Badge variant="destructive">DQ</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Pending Registrations */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Registrations</CardTitle>
          <CardDescription>
            Riders registered for this event who don&apos;t have results yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              All registered riders have results entered.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rider</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">
                        {reg.riders.first_name} {reg.riders.last_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {reg.riders.email || '—'}
                      </TableCell>
                      <TableCell>
                        {new Date(reg.registered_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {reg.notes || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAddDialog(reg)}
                          disabled={isPending}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Result
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Results entered for this event
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No results entered yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rider</TableHead>
                    <TableHead>Finish Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell className="font-medium">
                        {result.riders.first_name} {result.riders.last_name}
                      </TableCell>
                      <TableCell>
                        {result.finish_time ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {result.finish_time}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(result.status)}</TableCell>
                      <TableCell>{result.team_name || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {result.note || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditDialog(result)}
                            disabled={isPending}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteResult(result.id)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Result Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Result</DialogTitle>
            <DialogDescription>
              {selectedRegistration && (
                <>
                  Enter result for {selectedRegistration.riders.first_name}{' '}
                  {selectedRegistration.riders.last_name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ResultStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finishTime">Finish Time (HH:MM:SS)</Label>
              <Input
                id="finishTime"
                placeholder="e.g., 12:30:00"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                disabled={status !== 'finished'}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty if not applicable
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name (optional)</Label>
              <Input
                id="teamName"
                placeholder="For team events"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Notes (optional)</Label>
              <Textarea
                id="note"
                placeholder="Any additional notes..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddResult} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Result'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Result Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Result</DialogTitle>
            <DialogDescription>
              {selectedResult && (
                <>
                  Update result for {selectedResult.riders.first_name}{' '}
                  {selectedResult.riders.last_name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ResultStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-finishTime">Finish Time (HH:MM:SS)</Label>
              <Input
                id="edit-finishTime"
                placeholder="e.g., 12:30:00"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                disabled={status !== 'finished'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-teamName">Team Name (optional)</Label>
              <Input
                id="edit-teamName"
                placeholder="For team events"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">Notes (optional)</Label>
              <Textarea
                id="edit-note"
                placeholder="Any additional notes..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateResult} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
