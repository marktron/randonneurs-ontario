'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AwardRecipient } from '@/types/records'

const INITIAL_DISPLAY_COUNT = 10

interface AwardRecipientTableProps {
  title: string
  recipients: AwardRecipient[]
}

export function AwardRecipientTable({ title, recipients }: AwardRecipientTableProps) {
  const [showAll, setShowAll] = useState(false)
  const titleId = `record-table-${title.toLowerCase().replace(/\s+/g, '-')}`

  if (recipients.length === 0) {
    return (
      <div>
        <h3 id={titleId} className="font-medium text-lg mb-4">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm py-4">No records found</p>
      </div>
    )
  }

  const hasMore = recipients.length > INITIAL_DISPLAY_COUNT
  const displayed = showAll ? recipients : recipients.slice(0, INITIAL_DISPLAY_COUNT)

  return (
    <div>
      <h3 id={titleId} className="font-medium text-lg mb-4">
        {title}
      </h3>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((recipient) => (
              <TableRow key={`${recipient.riderSlug}-${recipient.awardYear}`}>
                <TableCell>
                  {recipient.riderSlug ? (
                    <Link href={`/riders/${recipient.riderSlug}`} className="hover:underline">
                      {recipient.riderName}
                    </Link>
                  ) : (
                    recipient.riderName
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{recipient.awardYear}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {displayed.map((recipient) => (
          <div
            key={`${recipient.riderSlug}-${recipient.awardYear}`}
            className="flex items-start gap-4 py-4 border-b border-border last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              {recipient.riderSlug ? (
                <Link
                  href={`/riders/${recipient.riderSlug}`}
                  className="font-medium hover:underline"
                >
                  {recipient.riderName}
                </Link>
              ) : (
                <span className="font-medium">{recipient.riderName}</span>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="font-medium tabular-nums">{recipient.awardYear}</span>
              <p className="text-xs text-muted-foreground">Year</p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll ? 'Show less' : `Show all ${recipients.length} recipients`}
        </button>
      )}
    </div>
  )
}
