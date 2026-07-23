'use client'

/**
 * Leg-selection dialog for importing per-leg controls from a collection-backed
 * event's RWGPS collection. Shared by the Event Controls manager
 * (`components/admin/event-controls-manager.tsx`) and the Control Cards form
 * (`components/admin/control-cards-form.tsx`) — see docs/rwgps-collections.md
 * → "Per-leg control cards".
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getEventCollectionLegs,
  importEventControlsFromRwgpsCollection,
  type CollectionLeg,
  type ImportedControl,
} from '@/lib/actions/event-controls'

interface CollectionLegImportDialogProps {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the imported controls (leg-major order) right before the dialog closes. */
  onImported: (controls: ImportedControl[]) => void
}

export function CollectionLegImportDialog({
  eventId,
  open,
  onOpenChange,
  onImported,
}: CollectionLegImportDialogProps) {
  const [legs, setLegs] = useState<CollectionLeg[] | null>(null)
  const [selectedLegIds, setSelectedLegIds] = useState<Set<string>>(new Set())
  const [isLoadingLegs, setIsLoadingLegs] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Fetch the collection's legs each time the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      setLegs(null)
      setIsLoadingLegs(true)
      try {
        const result = await getEventCollectionLegs(eventId)
        if (cancelled) return
        if (!result.success || !result.data) {
          toast.error(result.error || 'Failed to load the collection legs')
          onOpenChange(false)
          return
        }
        setLegs(result.data)
        // All legs checked by default; the admin unchecks combined/overview routes.
        setSelectedLegIds(new Set(result.data.map((leg) => leg.legRwgpsId)))
      } catch {
        // A rejected action (network down) would otherwise leave the dialog
        // stuck on "Loading legs…" forever.
        if (cancelled) return
        toast.error('Failed to load the collection legs')
        onOpenChange(false)
      } finally {
        if (!cancelled) setIsLoadingLegs(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId])

  const toggleLeg = (legRwgpsId: string) => {
    setSelectedLegIds((prev) => {
      const next = new Set(prev)
      if (next.has(legRwgpsId)) next.delete(legRwgpsId)
      else next.add(legRwgpsId)
      return next
    })
  }

  const handleImport = async () => {
    if (!legs) return
    setIsImporting(true)
    try {
      // Pass ids in the collection's (natural-sorted) leg order.
      const ids = legs
        .filter((leg) => selectedLegIds.has(leg.legRwgpsId))
        .map((leg) => leg.legRwgpsId)
      const result = await importEventControlsFromRwgpsCollection(eventId, ids)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to import controls')
        return
      }
      onImported(result.data)
      onOpenChange(false)
    } catch {
      // Mirror the error-result path: toast and keep the dialog open so the
      // admin can retry (the finally below clears the spinner).
      toast.error('Failed to import controls')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import controls from the route collection</DialogTitle>
          <DialogDescription>
            Choose which legs get control cards. Uncheck combined or overview routes.
          </DialogDescription>
        </DialogHeader>
        {isLoadingLegs || legs === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading legs…
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {legs.map((leg) => (
              <div key={leg.legRwgpsId} className="flex items-center gap-2">
                <Checkbox
                  id={`leg-${leg.legRwgpsId}`}
                  checked={selectedLegIds.has(leg.legRwgpsId)}
                  onCheckedChange={() => toggleLeg(leg.legRwgpsId)}
                />
                <Label htmlFor={`leg-${leg.legRwgpsId}`} className="text-sm font-normal">
                  {leg.name} · {leg.distanceKm} km
                </Label>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || legs === null || selectedLegIds.size === 0}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Import {selectedLegIds.size} leg{selectedLegIds.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
