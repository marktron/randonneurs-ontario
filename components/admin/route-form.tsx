'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { createRoute, updateRoute } from '@/lib/actions/routes'
import { createSlug } from '@/lib/utils'
import { toast } from 'sonner'
import type { ChapterOption, RouteOption } from '@/types/ui'

interface RouteFormProps {
  chapters: ChapterOption[]
  route?: RouteOption | null
  mode: 'create' | 'edit'
}

export function RouteForm({ chapters, route, mode }: RouteFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(route?.name || '')
  const [slug, setSlug] = useState(route?.slug || '')
  const [chapterId, setChapterId] = useState(route?.chapter_id || '')
  const [distanceKm, setDistanceKm] = useState(route?.distance_km?.toString() || '')
  const [collection, setCollection] = useState(route?.collection || '')
  const [description, setDescription] = useState(route?.description || '')
  const [rwgpsUrl, setRwgpsUrl] = useState(
    route?.rwgps_id ? `https://ridewithgps.com/routes/${route.rwgps_id}` : ''
  )
  const [cueSheetUrl, setCueSheetUrl] = useState(route?.cue_sheet_url || '')
  const [notes, setNotes] = useState(route?.notes || '')
  const [isActive, setIsActive] = useState(route?.is_active ?? true)

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value)
    if (mode === 'create' || !route?.slug) {
      setSlug(createSlug(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Route name is required')
      return
    }

    startTransition(async () => {
      const data = {
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
      }

      const result = mode === 'create'
        ? await createRoute(data)
        : await updateRoute(route!.id, data)

      if (result.success) {
        toast.success(mode === 'create' ? 'Route created successfully' : 'Route updated successfully')
        router.push('/admin/routes')
      } else {
        setError(result.error || 'Failed to save route')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'Create Route' : 'Edit Route'}</CardTitle>
        <CardDescription>
          {mode === 'create'
            ? 'Add a new route to the system'
            : 'Update route details and settings'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Route Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
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
              <p className="text-xs text-muted-foreground">
                Used in URLs. Auto-generated from name.
              </p>
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
            <p className="text-xs text-muted-foreground">
              Paste the full RWGPS URL. The route ID will be extracted automatically.
            </p>
            {route?.rwgps_id && (
              <a
                href={`https://ridewithgps.com/routes/${route.rwgps_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View current route on RWGPS
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
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
              rows={3}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for administrators (not shown publicly)..."
              rows={2}
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isPending}
            />
            <div>
              <Label htmlFor="active" className="cursor-pointer">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive routes won&apos;t appear in route selection lists
              </p>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                mode === 'create' ? 'Create Route' : 'Save Changes'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin/routes')}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
