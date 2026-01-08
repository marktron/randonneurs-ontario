'use client'

import { useRouter } from 'next/navigation'
import { TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface ClickableTableRowProps {
  href: string
  children: React.ReactNode
  className?: string
}

export function ClickableTableRow({ href, children, className }: ClickableTableRowProps) {
  const router = useRouter()

  return (
    <TableRow
      className={cn('cursor-pointer hover:bg-muted/50 transition-colors', className)}
      onClick={() => router.push(href)}
    >
      {children}
    </TableRow>
  )
}
