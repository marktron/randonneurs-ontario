'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { searchRiders, createRider, type RiderSearchResult } from '@/lib/actions/riders'
import { createResult } from '@/lib/actions/results'
import { toast } from 'sonner'
import { Loader2, Plus, Search, UserPlus } from 'lucide-react'

interface AddRiderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  season: number | null
  distanceKm: number
  existingRiderIds: Set<string>
}

export function AddRiderDialog({
  open,
  onOpenChange,
  eventId,
  season,
  distanceKm,
  existingRiderIds,
}: AddRiderDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'search' | 'create'>('search')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RiderSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedRider, setSelectedRider] = useState<RiderSearchResult | null>(null)

  // Create state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // Debounced search
  useEffect(() => {
    if (mode !== 'search' || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true)
      const results = await searchRiders(searchQuery)
      // Filter out riders already in the event
      const filtered = results.filter(r => !existingRiderIds.has(r.id))
      setSearchResults(filtered)
      setIsSearching(false)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, mode, existingRiderIds])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setMode('search')
      setSearchQuery('')
      setSearchResults([])
      setSelectedRider(null)
      setFirstName('')
      setLastName('')
      setEmail('')
    }
  }, [open])

  const handleSelectRider = (rider: RiderSearchResult) => {
    setSelectedRider(rider)
    setSearchQuery(`${rider.first_name} ${rider.last_name}`)
    setSearchResults([])
  }

  const handleAddExistingRider = () => {
    if (!selectedRider) return

    startTransition(async () => {
      const result = await createResult({
        eventId,
        riderId: selectedRider.id,
        status: 'pending',
        season: season ?? new Date().getFullYear(),
        distanceKm,
      })

      if (result.success) {
        toast.success(`Added ${selectedRider.first_name} ${selectedRider.last_name}`)
        router.refresh()
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Failed to add rider')
      }
    })
  }

  const handleCreateAndAdd = () => {
    if (!firstName || !lastName) {
      toast.error('First name and last name are required')
      return
    }

    startTransition(async () => {
      // First create the rider
      const createRes = await createRider({
        firstName,
        lastName,
        email: email || null,
      })

      if (!createRes.success || !createRes.riderId) {
        toast.error(createRes.error || 'Failed to create rider')
        return
      }

      // Then create the result
      const resultRes = await createResult({
        eventId,
        riderId: createRes.riderId,
        status: 'pending',
        season: season ?? new Date().getFullYear(),
        distanceKm,
      })

      if (resultRes.success) {
        toast.success(`Added ${firstName} ${lastName}`)
        router.refresh()
        onOpenChange(false)
      } else {
        toast.error(resultRes.error || 'Failed to add rider to event')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Rider</DialogTitle>
          <DialogDescription>
            Search for an existing rider or create a new one.
          </DialogDescription>
        </DialogHeader>

        {mode === 'search' ? (
          <div className="space-y-4">
            <InputGroup>
              <InputGroupAddon>
                <Search className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSelectedRider(null)
                }}
              />
            </InputGroup>

            {isSearching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {searchResults.map((rider) => (
                  <button
                    key={rider.id}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted/50 border-b last:border-b-0"
                    onClick={() => handleSelectRider(rider)}
                  >
                    <p className="font-medium">
                      {rider.first_name} {rider.last_name}
                    </p>
                    {rider.email && (
                      <p className="text-xs text-muted-foreground">{rider.email}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && !selectedRider && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No riders found
              </p>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setMode('create')}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create New Rider
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setMode('search')}
            >
              Back to Search
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'search' ? (
            <Button
              onClick={handleAddExistingRider}
              disabled={!selectedRider || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rider
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleCreateAndAdd}
              disabled={!firstName || !lastName || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create & Add
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
