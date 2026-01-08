'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { mergeRoutes, getRouteEventCounts } from '@/lib/actions/routes'
import { toast } from 'sonner'
import type { ChapterOption, RouteWithChapter } from '@/types/ui'

interface MergeRoutesDialogProps {
  selectedRoutes: RouteWithChapter[]
  chapters: ChapterOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function MergeRoutesDialog({
  selectedRoutes,
  chapters,
  open,
  onOpenChange,
  onSuccess,
}: MergeRoutesDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})

  const [targetRouteId, setTargetRouteId] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [chapterId, setChapterId] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [collection, setCollection] = useState('')
  const [description, setDescription] = useState('')
  const [rwgpsUrl, setRwgpsUrl] = useState('')
  const [cueSheetUrl, setCueSheetUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Populate form fields from a route
  const populateFromRoute = (route: RouteWithChapter) => {
    setName(route.name)
    setSlug(route.slug)
    setChapterId(route.chapter_id || '')
    setDistanceKm(route.distance_km?.toString() || '')
    setCollection(route.collection || '')
    setDescription(route.description || '')
    setRwgpsUrl(route.rwgps_id ? `https://ridewithgps.com/routes/${route.rwgps_id}` : '')
    setCueSheetUrl(route.cue_sheet_url || '')
    setNotes(route.notes || '')
    setIsActive(route.is_active ?? true)
  }

  // Handle target route change - populate form with that route's values
  const handleTargetChange = (routeId: string) => {
    setTargetRouteId(routeId)
    const route = selectedRoutes.find(r => r.id === routeId)
    if (route) {
      populateFromRoute(route)
    }
  }

  // Reset form when dialog opens with new routes
  useEffect(() => {
    if (open && selectedRoutes.length > 0) {
      setError(null)

      // Fetch event counts for selected routes, then select the best target
      getRouteEventCounts(selectedRoutes.map(r => r.id)).then((counts) => {
        setEventCounts(counts)

        // Determine best route to use as target:
        // 1. If exactly one route is active, use that
        // 2. Otherwise, use the one with the most events
        const activeRoutes = selectedRoutes.filter(r => r.is_active)
        let bestRoute: RouteWithChapter

        if (activeRoutes.length === 1) {
          // Exactly one active route - use it
          bestRoute = activeRoutes[0]
        } else {
          // Find route with most events
          let maxEvents = -1
          bestRoute = selectedRoutes[0]
          for (const route of selectedRoutes) {
            const count = counts[route.id] || 0
            if (count > maxEvents) {
              maxEvents = count
              bestRoute = route
            }
          }
        }

        setTargetRouteId(bestRoute.id)
        populateFromRoute(bestRoute)
      })
    }
  }, [open, selectedRoutes])

  const totalEvents = Object.values(eventCounts).reduce((sum, count) => sum + count, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Route name is required')
      return
    }

    startTransition(async () => {
      const result = await mergeRoutes({
        targetRouteId,
        sourceRouteIds: selectedRoutes.map(r => r.id),
        routeData: {
          name: name.trim(),
          slug,
          chapterId: chapterId || null,
          distanceKm: distanceKm ? parseFloat(distanceKm) : null,
          collection: collection || null,
          description: description || null,
          rwgpsUrl: rwgpsUrl || null,
          cueSheetUrl: cueSheetUrl || null,
          notes: notes || null,
          isActive,
        },
      })

      if (result.success) {
        toast.success(
          `Routes merged successfully. ${result.updatedEventsCount || 0} events updated.`
        )
        onOpenChange(false)
        onSuccess()
      } else {
        setError(result.error || 'Failed to merge routes')
        toast.error(result.error || 'Failed to merge routes')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:!max-w-[700px] max-h-[calc(100vh-4rem)] overflow-y-auto top-8 translate-y-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Routes
          </DialogTitle>
          <DialogDescription>
            Merging {selectedRoutes.length} routes into one. All events will be updated to use the merged route.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Routes being merged */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">Routes to merge:</p>
            <ul className="text-sm space-y-1">
              {selectedRoutes.map((route) => (
                <li key={route.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {route.name}
                    {route.id === targetRouteId && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        target
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {eventCounts[route.id] || 0} events
                  </span>
                </li>
              ))}
            </ul>
            {totalEvents > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                ⚠️ {totalEvents} event{totalEvents !== 1 ? 's' : ''} will be updated to use the merged route
              </p>
            )}
          </div>

          {/* Target route selector */}
          <div className="space-y-2">
            <Label htmlFor="target">Keep Route</Label>
            <Select value={targetRouteId} onValueChange={handleTargetChange} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Select route to keep" />
              </SelectTrigger>
              <SelectContent>
                {selectedRoutes.map((route) => (
                  <SelectItem key={route.id} value={route.id}>
                    {route.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This route will be updated with the merged properties. Other routes will be deleted.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Route Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Waterloo-Paris 200"
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="waterloo-paris-200"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="chapter">Chapter</Label>
              <Select value={chapterId || 'none'} onValueChange={(v) => setChapterId(v === 'none' ? '' : v)} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select chapter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No chapter</SelectItem>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
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
                min="0"
                step="0.1"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection">Collection</Label>
              <Input
                id="collection"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="e.g., Spring Series"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rwgps">Ride With GPS Link</Label>
            <Input
              id="rwgps"
              value={rwgpsUrl}
              onChange={(e) => setRwgpsUrl(e.target.value)}
              placeholder="https://ridewithgps.com/routes/12345678"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cueSheet">Cue Sheet URL</Label>
            <Input
              id="cueSheet"
              value={cueSheetUrl}
              onChange={(e) => setCueSheetUrl(e.target.value)}
              placeholder="https://example.com/cuesheet.pdf"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the route..."
              rows={2}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for administrators..."
              rows={2}
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isPending}
            />
            <Label htmlFor="active" className="cursor-pointer text-sm">
              Active
            </Label>
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
                  Merge Routes
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
