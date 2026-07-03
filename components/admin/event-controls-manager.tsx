'use client'

import { useState, useTransition } from 'react'
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
  saveEventControls,
  importEventControlsFromRwgps,
  type AdminEventControl,
  type EventControlInput,
} from '@/lib/actions/event-controls'
import { DEFAULT_CONTROL_RADIUS_M } from '@/lib/brevet-card'
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
}

interface EventControlsManagerProps {
  eventId: string
  initialControls: AdminEventControl[]
  hasRwgpsRoute: boolean
}

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
  }
}

export function EventControlsManager({
  eventId,
  initialControls,
  hasRwgpsRoute,
}: EventControlsManagerProps) {
  const router = useRouter()
  const [rows, setRows] = useState<ControlRow[]>(initialControls.map(toRow))
  const [isPending, startTransition] = useTransition()
  const [isImporting, setIsImporting] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

  const existingWithCheckins = initialControls.filter((c) => c.checkinCount > 0)
  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id!))
  const removedWithCheckins = existingWithCheckins.filter((c) => !keptIds.has(c.id))

  const updateRow = (key: string, field: keyof ControlRow, value: string) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        key: nextRowKey(),
        name: '',
        distanceKm: '',
        lat: '',
        lng: '',
        radiusM: String(DEFAULT_CONTROL_RADIUS_M),
        notes: '',
        checkinCount: 0,
      },
    ])
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
          notes: '',
          checkinCount: 0,
        }))
      )
      toast.success(`Imported ${result.data.length} controls — review and save`)
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
          {hasRwgpsRoute && (
            <Button variant="outline" onClick={handleImport} disabled={isImporting || isPending}>
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import from RWGPS
            </Button>
          )}
          <Button variant="outline" onClick={addRow} disabled={isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Add control
          </Button>
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
          <Table>
            <TableHeader>
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
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, 'name', e.target.value)}
                      placeholder="Control name"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.distanceKm}
                      onChange={(e) => updateRow(row.key, 'distanceKm', e.target.value)}
                      inputMode="decimal"
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.lat}
                      onChange={(e) => updateRow(row.key, 'lat', e.target.value)}
                      inputMode="decimal"
                      placeholder="—"
                      className="tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.lng}
                      onChange={(e) => updateRow(row.key, 'lng', e.target.value)}
                      inputMode="decimal"
                      placeholder="—"
                      className="tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.radiusM}
                      onChange={(e) => updateRow(row.key, 'radiusM', e.target.value)}
                      inputMode="numeric"
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.notes}
                      onChange={(e) => updateRow(row.key, 'notes', e.target.value)}
                      placeholder="Optional"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.checkinCount}
                  </TableCell>
                  <TableCell>
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
    </div>
  )
}
