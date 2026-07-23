'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  saveEventControls,
  importEventControlsFromRwgps,
  getEventCollectionLegs,
  importEventControlsFromRwgpsCollection,
  type AdminEventControl,
  type EventControlInput,
  type CollectionLeg,
} from '@/lib/actions/event-controls'
import { saveEventOrganizer, type OrganizerContact } from '@/lib/actions/event-organizer'
import { DEFAULT_CONTROL_RADIUS_M } from '@/lib/brevet-card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Download, Loader2, Plus, Save, Trash2 } from 'lucide-react'

interface ControlRow {
  /** DB id when the row already exists; undefined for new rows. */
  id?: string
  key: string
  name: string
  distanceKm: string
  lat: string
  lng: string
  radiusM: string
  notes: string
  checkinCount: number
  legRwgpsId: string | null
  legName: string | null
}

interface EventControlsManagerProps {
  eventId: string
  initialControls: AdminEventControl[]
  hasRwgpsRoute: boolean
  hasRwgpsCollection: boolean
  initialOrganizer: OrganizerContact
}

interface RowGroup {
  legRwgpsId: string | null
  legName: string | null
  rows: ControlRow[]
}

/** Group rows by leg in first-appearance order; untagged rows form the null group. */
function groupRows(rows: ControlRow[]): RowGroup[] {
  const groups: RowGroup[] = []
  const byKey = new Map<string | null, RowGroup>()
  for (const row of rows) {
    let group = byKey.get(row.legRwgpsId)
    if (!group) {
      group = { legRwgpsId: row.legRwgpsId, legName: row.legName, rows: [] }
      byKey.set(row.legRwgpsId, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// Mobile-only field label for the stacked card layout (< sm)
const MOBILE_LABEL = 'w-20 shrink-0 text-xs font-medium text-muted-foreground sm:hidden'

let rowKeyCounter = 0
function nextRowKey(): string {
  rowKeyCounter += 1
  return `row-${rowKeyCounter}`
}

function toRow(control: AdminEventControl): ControlRow {
  return {
    id: control.id,
    key: nextRowKey(),
    name: control.name,
    distanceKm: String(control.distanceKm),
    lat: control.lat === null ? '' : String(control.lat),
    lng: control.lng === null ? '' : String(control.lng),
    radiusM: String(control.radiusM),
    notes: control.notes || '',
    checkinCount: control.checkinCount,
    legRwgpsId: control.legRwgpsId,
    legName: control.legName,
  }
}

export function EventControlsManager({
  eventId,
  initialControls,
  hasRwgpsRoute,
  hasRwgpsCollection,
  initialOrganizer,
}: EventControlsManagerProps) {
  const router = useRouter()
  const [rows, setRows] = useState<ControlRow[]>(() => initialControls.map(toRow))
  const [isPending, startTransition] = useTransition()
  const [isImporting, setIsImporting] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [organizer, setOrganizer] = useState<OrganizerContact>(initialOrganizer)
  const [isSavingOrganizer, setIsSavingOrganizer] = useState(false)

  const handleSaveOrganizer = async () => {
    setIsSavingOrganizer(true)
    try {
      const result = await saveEventOrganizer(eventId, organizer)
      if (result.success) {
        toast.success('Ride organizer saved')
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save organizer')
      }
    } finally {
      setIsSavingOrganizer(false)
    }
  }

  const existingWithCheckins = initialControls.filter((c) => c.checkinCount > 0)
  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id!))
  const removedWithCheckins = existingWithCheckins.filter((c) => !keptIds.has(c.id))

  const updateRow = (key: string, field: keyof ControlRow, value: string) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  const addRow = (leg?: { legRwgpsId: string; legName: string }) => {
    const newRow: ControlRow = {
      key: nextRowKey(),
      name: '',
      distanceKm: '',
      lat: '',
      lng: '',
      radiusM: String(DEFAULT_CONTROL_RADIUS_M),
      notes: '',
      checkinCount: 0,
      legRwgpsId: leg?.legRwgpsId ?? null,
      legName: leg?.legName ?? null,
    }
    if (!leg) {
      setRows((prev) => [...prev, newRow])
      return
    }
    // Insert after the last row of this leg so the new row lands in its section.
    setRows((prev) => {
      const lastIndex = prev.map((r) => r.legRwgpsId).lastIndexOf(leg.legRwgpsId)
      if (lastIndex === -1) return [...prev, newRow]
      return [...prev.slice(0, lastIndex + 1), newRow, ...prev.slice(lastIndex + 1)]
    })
  }

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key))
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const result = await importEventControlsFromRwgps(eventId)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to import controls')
        return
      }
      // Imported rows replace the current unsaved list; existing DB rows are
      // only deleted if the admin then hits Save (with a warning when
      // check-ins would be lost).
      setRows(
        result.data.map((control) => ({
          key: nextRowKey(),
          name: control.name,
          distanceKm: String(control.distanceKm),
          lat: control.lat === null ? '' : String(control.lat),
          lng: control.lng === null ? '' : String(control.lng),
          radiusM: String(DEFAULT_CONTROL_RADIUS_M),
          notes: control.notes ?? '',
          checkinCount: 0,
          legRwgpsId: control.legRwgpsId ?? null,
          legName: control.legName ?? null,
        }))
      )
      toast.success(`Imported ${result.data.length} controls — review and save`)
    } finally {
      setIsImporting(false)
    }
  }

  // ---- Collection leg-selection import --------------------------------
  const [legDialogOpen, setLegDialogOpen] = useState(false)
  const [legs, setLegs] = useState<CollectionLeg[] | null>(null)
  const [selectedLegIds, setSelectedLegIds] = useState<Set<string>>(new Set())
  const [isLoadingLegs, setIsLoadingLegs] = useState(false)

  const openLegDialog = async () => {
    setLegDialogOpen(true)
    setLegs(null)
    setIsLoadingLegs(true)
    try {
      const result = await getEventCollectionLegs(eventId)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load the collection legs')
        setLegDialogOpen(false)
        return
      }
      setLegs(result.data)
      // All legs checked by default; the admin unchecks combined/overview routes.
      setSelectedLegIds(new Set(result.data.map((leg) => leg.legRwgpsId)))
    } catch {
      // A rejected action (network down) would otherwise leave the dialog
      // stuck on "Loading legs…" forever.
      toast.error('Failed to load the collection legs')
      setLegDialogOpen(false)
    } finally {
      setIsLoadingLegs(false)
    }
  }

  const toggleLeg = (legRwgpsId: string) => {
    setSelectedLegIds((prev) => {
      const next = new Set(prev)
      if (next.has(legRwgpsId)) next.delete(legRwgpsId)
      else next.add(legRwgpsId)
      return next
    })
  }

  const handleCollectionImport = async () => {
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
      setRows(
        result.data.map((control) => ({
          key: nextRowKey(),
          name: control.name,
          distanceKm: String(control.distanceKm),
          lat: control.lat === null ? '' : String(control.lat),
          lng: control.lng === null ? '' : String(control.lng),
          radiusM: String(DEFAULT_CONTROL_RADIUS_M),
          notes: control.notes ?? '',
          checkinCount: 0,
          legRwgpsId: control.legRwgpsId,
          legName: control.legName,
        }))
      )
      setLegDialogOpen(false)
      toast.success(
        `Imported ${result.data.length} controls across ${ids.length} legs — review and save`
      )
    } catch {
      // Mirror the error-result path: toast and keep the dialog open so the
      // admin can retry (the finally below clears the spinner).
      toast.error('Failed to import controls')
    } finally {
      setIsImporting(false)
    }
  }

  const parseRows = (): EventControlInput[] | null => {
    const parsed: EventControlInput[] = []
    for (const row of rows) {
      const distanceKm = parseFloat(row.distanceKm)
      const radiusM = parseFloat(row.radiusM)
      const lat = row.lat.trim() === '' ? null : parseFloat(row.lat)
      const lng = row.lng.trim() === '' ? null : parseFloat(row.lng)
      if (!row.name.trim()) {
        toast.error('Every control needs a name')
        return null
      }
      if (!Number.isFinite(distanceKm) || distanceKm < 0) {
        toast.error(`Invalid distance for "${row.name}"`)
        return null
      }
      if (!Number.isFinite(radiusM) || radiusM <= 0) {
        toast.error(`Invalid radius for "${row.name}"`)
        return null
      }
      if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
        toast.error(`Invalid coordinates for "${row.name}"`)
        return null
      }
      parsed.push({
        id: row.id,
        name: row.name.trim(),
        distanceKm,
        lat,
        lng,
        radiusM,
        notes: row.notes.trim() || null,
        legRwgpsId: row.legRwgpsId,
        legName: row.legName,
      })
    }
    return parsed
  }

  const doSave = (parsed: EventControlInput[]) => {
    startTransition(async () => {
      const result = await saveEventControls(eventId, parsed)
      if (result.success) {
        toast.success('Controls saved')
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save controls')
      }
    })
  }

  const handleSave = () => {
    const parsed = parseRows()
    if (!parsed) return
    if (removedWithCheckins.length > 0) {
      setConfirmSaveOpen(true)
      return
    }
    doSave(parsed)
  }

  // Auto-load controls from RWGPS on mount when the event has none saved yet, so
  // the table is prefilled for review instead of showing an empty state. This
  // mirrors clicking "Import from RWGPS" (unsaved rows; the admin still hits
  // Save). The ref guard keeps strict-mode's double-invoked effect from
  // importing twice in development.
  const didAutoImportRef = useRef(false)
  useEffect(() => {
    if (didAutoImportRef.current) return
    if (initialControls.length === 0 && hasRwgpsRoute) {
      didAutoImportRef.current = true
      handleImport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasLegRows = rows.some((r) => r.legRwgpsId !== null)

  const renderControlRow = (row: ControlRow) => (
    <TableRow
      key={row.key}
      className="relative block space-y-2 p-4 sm:table-row sm:space-y-0 sm:p-0"
    >
      <TableCell className="flex items-center gap-3 p-0 pr-12 sm:table-cell sm:p-3 sm:pr-3">
        <span className={MOBILE_LABEL}>Name</span>
        <Input
          value={row.name}
          onChange={(e) => updateRow(row.key, 'name', e.target.value)}
          placeholder="Control name"
        />
      </TableCell>
      <TableCell className="flex items-center gap-3 p-0 sm:table-cell sm:p-3">
        <span className={MOBILE_LABEL}>Km</span>
        <Input
          value={row.distanceKm}
          onChange={(e) => updateRow(row.key, 'distanceKm', e.target.value)}
          inputMode="decimal"
          className="text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="flex items-center gap-3 p-0 sm:table-cell sm:p-3">
        <span className={MOBILE_LABEL}>Latitude</span>
        <Input
          value={row.lat}
          onChange={(e) => updateRow(row.key, 'lat', e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className="tabular-nums"
        />
      </TableCell>
      <TableCell className="flex items-center gap-3 p-0 sm:table-cell sm:p-3">
        <span className={MOBILE_LABEL}>Longitude</span>
        <Input
          value={row.lng}
          onChange={(e) => updateRow(row.key, 'lng', e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className="tabular-nums"
        />
      </TableCell>
      <TableCell className="flex items-center gap-3 p-0 sm:table-cell sm:p-3">
        <span className={MOBILE_LABEL}>Radius (m)</span>
        <Input
          value={row.radiusM}
          onChange={(e) => updateRow(row.key, 'radiusM', e.target.value)}
          inputMode="numeric"
          className="text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="flex items-center gap-3 p-0 sm:table-cell sm:p-3">
        <span className={MOBILE_LABEL}>Notes</span>
        <Input
          value={row.notes}
          onChange={(e) => updateRow(row.key, 'notes', e.target.value)}
          placeholder="Optional"
        />
      </TableCell>
      <TableCell
        className={cn(
          'items-center gap-3 p-0 text-muted-foreground tabular-nums sm:table-cell sm:p-3 sm:text-right',
          row.checkinCount > 0 ? 'flex' : 'hidden'
        )}
      >
        <span className={MOBILE_LABEL}>Check-ins</span>
        {row.checkinCount}
      </TableCell>
      <TableCell className="absolute top-2.5 right-2.5 block p-0 sm:static sm:table-cell sm:p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeRow(row.key)}
          aria-label={`Remove ${row.name || 'control'}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Controls</h2>
          <p className="text-sm text-muted-foreground">
            Controls power the riders&apos; digital brevet card. Open/close times are computed from
            distance — coordinates enable GPS check-in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(hasRwgpsRoute || hasRwgpsCollection) && (
            <Button
              variant="outline"
              onClick={hasRwgpsCollection ? openLegDialog : handleImport}
              disabled={isImporting || isPending}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import from RWGPS
            </Button>
          )}
          {!hasLegRows && (
            <Button variant="outline" onClick={() => addRow()} disabled={isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Add control
            </Button>
          )}
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save controls
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-md p-6 text-center">
          No controls yet. Import them from the route&apos;s RideWithGPS data or add them manually.
          The digital brevet card stays hidden from riders until controls are saved.
        </p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <Table className="block sm:table">
            <TableHeader className="hidden sm:table-header-group">
              <TableRow>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="w-24 text-right">Km</TableHead>
                <TableHead className="w-32">Latitude</TableHead>
                <TableHead className="w-32">Longitude</TableHead>
                <TableHead className="w-24 text-right">Radius (m)</TableHead>
                <TableHead className="min-w-[140px]">Notes</TableHead>
                <TableHead className="w-24 text-right">Check-ins</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody className="block sm:table-row-group">
              {groupRows(rows).map((group) => (
                <Fragment key={group.legRwgpsId ?? 'no-leg'}>
                  {group.legRwgpsId !== null && (
                    <TableRow className="block bg-muted/50 sm:table-row">
                      <TableCell colSpan={8} className="block p-3 sm:table-cell">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{group.legName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Add control to ${group.legName}`}
                            onClick={() =>
                              addRow({ legRwgpsId: group.legRwgpsId!, legName: group.legName! })
                            }
                            disabled={isPending}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add control
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((row) => renderControlRow(row))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete controls with recorded check-ins?</AlertDialogTitle>
            <AlertDialogDescription>
              {removedWithCheckins.map((c) => `"${c.name}" (${c.checkinCount})`).join(', ')} will be
              removed along with the riders&apos; check-ins recorded there. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const parsed = parseRows()
                if (parsed) doSave(parsed)
              }}
            >
              Delete and save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={legDialogOpen} onOpenChange={setLegDialogOpen}>
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
            <Button variant="outline" onClick={() => setLegDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCollectionImport}
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

      <div className="space-y-3 border rounded-md p-4">
        <div>
          <h2 className="text-xl font-semibold">Ride organizer</h2>
          <p className="text-sm text-muted-foreground">
            Shown to riders on the digital brevet card. Prefilled from the chapter VP — edit for
            this event&apos;s organizer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="organizer-name">
              Name
            </label>
            <Input
              id="organizer-name"
              value={organizer.name}
              onChange={(e) => setOrganizer((o) => ({ ...o, name: e.target.value }))}
              placeholder="Organizer name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="organizer-phone">
              Phone
            </label>
            <Input
              id="organizer-phone"
              value={organizer.phone}
              onChange={(e) => setOrganizer((o) => ({ ...o, phone: e.target.value }))}
              placeholder="416-555-0101"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="organizer-email">
              Email
            </label>
            <Input
              id="organizer-email"
              value={organizer.email}
              onChange={(e) => setOrganizer((o) => ({ ...o, email: e.target.value }))}
              placeholder="name@example.ca"
            />
          </div>
        </div>
        <Button variant="outline" onClick={handleSaveOrganizer} disabled={isSavingOrganizer}>
          {isSavingOrganizer ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save organizer
        </Button>
      </div>
    </div>
  )
}
