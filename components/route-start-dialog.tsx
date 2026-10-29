'use client'

import { useId, useRef, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RouteStartPicker } from '@/components/route-start-picker'
import type { RouteControl, RouteTrack } from '@/lib/routeTrack'

interface RouteStartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: RouteTrack
  /** Chosen start, km along the route as posted; null = posted start. */
  valueKm: number | null
  onChange: (km: number | null) => void
  /** Name of the chosen start; asked for here once an alternate start is chosen. */
  startLocation: string
  onStartLocationChange: (name: string) => void
  controls?: RouteControl[]
  onPickControl?: (name: string, passesKm: number[]) => void
  disabled?: boolean
  /** Where focus goes when the dialog closes (Radix's default is the element focused before it opened). */
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus']
}

/**
 * The permanent start picker in a dialog: full screen on a phone, a large
 * centred dialog from `sm` up. A map inside the scrolling form fought the page
 * (a thumb scrolling the form panned the map or dropped a pin), so the map
 * only lives here. A choice applies as the rider makes it. Done asks for a
 * name when an alternate start is chosen; Escape, the overlay and the close
 * button just close, and the form notes a start still to be named.
 */
export function RouteStartDialog({
  open,
  onOpenChange,
  track,
  valueKm,
  onChange,
  startLocation,
  onStartLocationChange,
  controls,
  onPickControl,
  disabled,
  onCloseAutoFocus,
}: RouteStartDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const nameHelpId = useId()
  const nameErrorId = useId()
  // Set by a Done that found no name; the message shows while it still applies.
  const [doneTried, setDoneTried] = useState(false)
  const needsName = valueKm != null && startLocation.trim() === ''
  const showNameError = doneTried && needsName

  function changeOpen(next: boolean) {
    if (!next) setDoneTried(false)
    onOpenChange(next)
  }

  function done() {
    if (needsName) {
      setDoneTried(true)
      nameRef.current?.focus()
      return
    }
    changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        ref={contentRef}
        // Focus the dialog itself rather than its first field: a focus ring on
        // the control list read as if a control were already chosen. Tab
        // goes on to the map, its zoom buttons, the list, Done.
        // A start that still needs a name opens on the name field instead.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(needsName ? nameRef.current : contentRef.current)?.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className="outline-none top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none p-4 sm:top-1/2 sm:left-1/2 sm:h-[90dvh] sm:w-[calc(100%-4rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-4xl sm:p-6"
      >
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>Choose where you start</DialogTitle>
          <DialogDescription>
            Tap the route where you will start and finish, or tap a flag to start at that control.
            The white dot is the posted start.
          </DialogDescription>
        </DialogHeader>

        {/* Map and fields share one scrolling area: the map takes the spare
            height, and when a phone keyboard shrinks the viewport the map
            stops at its minimum and the fields scroll into view. */}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
          <RouteStartPicker
            track={track}
            valueKm={valueKm}
            onChange={onChange}
            controls={controls}
            onPickControl={onPickControl}
            disabled={disabled}
          />

          {valueKm != null && (
            <div className="shrink-0 space-y-2 p-1">
              <Label htmlFor="location">Name of your start location</Label>
              <Input
                ref={nameRef}
                id="location"
                type="text"
                placeholder="e.g., Tim Hortons, 123 Main St, Uxbridge"
                value={startLocation}
                maxLength={200}
                onChange={(e) => onStartLocationChange(e.target.value)}
                disabled={disabled}
                autoComplete="off"
                aria-invalid={showNameError || undefined}
                aria-describedby={showNameError ? `${nameErrorId} ${nameHelpId}` : nameHelpId}
              />
              {showNameError && (
                <p id={nameErrorId} className="text-sm text-destructive">
                  Please name your start location
                </p>
              )}
              <p id={nameHelpId} className="text-xs text-muted-foreground">
                This appears as the first and last control on your card.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 sm:justify-between">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            {valueKm == null
              ? 'Starting at the posted start'
              : `Starts ${valueKm.toFixed(1)} km into the posted route`}
          </p>
          <Button type="button" className="h-12 px-6 sm:h-9" onClick={done}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
