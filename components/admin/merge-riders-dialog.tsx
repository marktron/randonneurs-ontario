'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2, GitMerge } from 'lucide-react'
import { mergeRiders, getRiderCounts } from '@/lib/actions/riders'
import { toast } from 'sonner'

export interface RiderForMerge {
  id: string
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
}

interface MergeRidersDialogProps {
  selectedRiders: RiderForMerge[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MergeRidersDialog({
  selectedRiders,
  open,
  onOpenChange,
}: MergeRidersDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, { registrations: number; results: number }>>({})

  const [targetRiderId, setTargetRiderId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('')

  // Populate form fields from a rider
  const populateFromRider = (rider: RiderForMerge) => {
    setFirstName(rider.first_name)
    setLastName(rider.last_name)
    setEmail(rider.email || '')
    setGender(rider.gender || '')
  }

  // Handle target rider change
  const handleTargetChange = (riderId: string) => {
    setTargetRiderId(riderId)
    const rider = selectedRiders.find(r => r.id === riderId)
    if (rider) {
      populateFromRider(rider)
    }
  }

  // Reset form when dialog opens with new riders
  useEffect(() => {
    if (open && selectedRiders.length > 0) {
      setError(null)

      // Fetch counts for selected riders, then select the best target
      getRiderCounts(selectedRiders.map(r => r.id)).then((fetchedCounts) => {
        setCounts(fetchedCounts)

        // Determine best rider to use as target:
        // 1. Prefer one with email
        // 2. Then prefer one with more registrations/results
        const withEmail = selectedRiders.filter(r => r.email)
        let bestRider: RiderForMerge

        if (withEmail.length === 1) {
          bestRider = withEmail[0]
        } else if (withEmail.length > 1) {
          // Multiple with email - pick one with most activity
          let maxActivity = -1
          bestRider = withEmail[0]
          for (const rider of withEmail) {
            const c = fetchedCounts[rider.id] || { registrations: 0, results: 0 }
            const activity = c.registrations + c.results
            if (activity > maxActivity) {
              maxActivity = activity
              bestRider = rider
            }
          }
        } else {
          // None with email - pick one with most activity
          let maxActivity = -1
          bestRider = selectedRiders[0]
          for (const rider of selectedRiders) {
            const c = fetchedCounts[rider.id] || { registrations: 0, results: 0 }
            const activity = c.registrations + c.results
            if (activity > maxActivity) {
              maxActivity = activity
              bestRider = rider
            }
          }
        }

        setTargetRiderId(bestRider.id)
        populateFromRider(bestRider)

        // If target doesn't have email but another does, use that email
        if (!bestRider.email) {
          const riderWithEmail = selectedRiders.find(r => r.email)
          if (riderWithEmail) {
            setEmail(riderWithEmail.email || '')
          }
        }
      })
    }
  }, [open, selectedRiders])

  const totalRegistrations = Object.values(counts).reduce((sum, c) => sum + c.registrations, 0)
  const totalResults = Object.values(counts).reduce((sum, c) => sum + c.results, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required')
      return
    }

    startTransition(async () => {
      const result = await mergeRiders({
        targetRiderId,
        sourceRiderIds: selectedRiders.map(r => r.id),
        riderData: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          gender: gender || null,
        },
      })

      if (result.success) {
        const parts = []
        if (result.updatedRegistrationsCount) {
          parts.push(`${result.updatedRegistrationsCount} registration${result.updatedRegistrationsCount !== 1 ? 's' : ''}`)
        }
        if (result.updatedResultsCount) {
          parts.push(`${result.updatedResultsCount} result${result.updatedResultsCount !== 1 ? 's' : ''}`)
        }
        const message = parts.length > 0
          ? `Riders merged. ${parts.join(' and ')} updated.`
          : 'Riders merged successfully.'
        toast.success(message)
        onOpenChange(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to merge riders')
        toast.error(result.error || 'Failed to merge riders')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Riders
          </DialogTitle>
          <DialogDescription>
            Merging {selectedRiders.length} riders into one. All registrations and results will be transferred.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Riders being merged */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">Riders to merge:</p>
            <ul className="text-sm space-y-1">
              {selectedRiders.map((rider) => {
                const c = counts[rider.id] || { registrations: 0, results: 0 }
                return (
                  <li key={rider.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {rider.first_name} {rider.last_name}
                      {rider.email && (
                        <span className="ml-1 text-xs">({rider.email})</span>
                      )}
                      {rider.id === targetRiderId && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          target
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.registrations}r / {c.results}res
                    </span>
                  </li>
                )
              })}
            </ul>
            {(totalRegistrations > 0 || totalResults > 0) && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {totalRegistrations} registration{totalRegistrations !== 1 ? 's' : ''} and {totalResults} result{totalResults !== 1 ? 's' : ''} will be merged
              </p>
            )}
          </div>

          {/* Target rider selector */}
          <div className="space-y-2">
            <Label htmlFor="target">Keep Rider</Label>
            <Select value={targetRiderId} onValueChange={handleTargetChange} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Select rider to keep" />
              </SelectTrigger>
              <SelectContent>
                {selectedRiders.map((rider) => (
                  <SelectItem key={rider.id} value={rider.id}>
                    {rider.first_name} {rider.last_name}
                    {rider.email && ` (${rider.email})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This rider will be updated with the merged properties. Others will be deleted.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender || 'none'} onValueChange={(v) => setGender(v === 'none' ? '' : v)} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                  <SelectItem value="X">Non-binary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="mr-2 h-4 w-4" />
                  Merge Riders
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
