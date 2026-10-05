'use client'

import { useRef, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
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
 * only lives here. A choice applies as the rider makes it; Done, Escape, the
 * overlay and the close button all just close.
 */
export function RouteStartDialog({
  open,
  onOpenChange,
  track,
  valueKm,
  onChange,
  controls,
  onPickControl,
  disabled,
  onCloseAutoFocus,
}: RouteStartDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        // Focus the dialog itself rather than its first field: a focus ring on
        // the control list read as if a control were already chosen. Tab
        // goes on to the map, its zoom buttons, the list, the km field, Done.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          contentRef.current?.focus()
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

        <RouteStartPicker
          track={track}
          valueKm={valueKm}
          onChange={onChange}
          controls={controls}
          onPickControl={onPickControl}
          disabled={disabled}
        />

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 sm:justify-between">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            {valueKm == null
              ? 'Starting at the posted start'
              : `Starts ${valueKm.toFixed(1)} km into the posted route`}
          </p>
          <Button type="button" className="h-12 px-6 sm:h-9" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
