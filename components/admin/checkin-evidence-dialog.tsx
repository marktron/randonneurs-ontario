'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatControlTime } from '@/lib/brmTimes'
import { cn } from '@/lib/utils'
import {
  FLAG_LABELS,
  formatCheckinDistanceCompact,
  type CheckinEvidenceControl,
} from '@/lib/checkin-evidence'

interface CheckinEvidenceDialogProps {
  riderName: string
  eventId: string
  controls: CheckinEvidenceControl[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Read-only summary of a rider's digital-card check-ins, opened from the
 * results table's evidence column. Corrections happen on the Digital Cards
 * grid — the footer links there.
 */
export function CheckinEvidenceDialog({
  riderName,
  eventId,
  controls,
  open,
  onOpenChange,
}: CheckinEvidenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{riderName}</DialogTitle>
          <DialogDescription>Digital card check-ins</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {controls.map((control, index) => {
            const { checkin } = control
            const activeFlags = checkin ? FLAG_LABELS.filter(({ key }) => checkin.flags[key]) : []
            return (
              <li key={index} className={cn('text-sm', !checkin && 'text-muted-foreground/60')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {control.name} — {control.distanceKm} km
                  </span>
                  <span className="tabular-nums">
                    {checkin ? formatControlTime(new Date(checkin.checkedInAt)) : '—'}
                  </span>
                </div>
                {checkin && (checkin.method !== 'gps' || activeFlags.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {checkin.method !== 'gps' && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {checkin.method}
                      </Badge>
                    )}
                    {activeFlags.map(({ key, label, title }) => (
                      <Badge
                        key={key}
                        variant="outline"
                        title={title}
                        className="text-[10px] px-1 py-0"
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
                {checkin?.distanceToControlM != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCheckinDistanceCompact(checkin.distanceToControlM, checkin.accuracyM)}
                  </p>
                )}
                {checkin?.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{checkin.note}</p>
                )}
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Link
            href={`/admin/events/${eventId}/brevet-card`}
            className="text-sm text-primary hover:underline"
          >
            Manage check-ins
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
