import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface AdminPaginationProps {
  page: number
  pageSize: number
  totalCount: number
  /** Build the URL for a given page number */
  buildPageUrl: (page: number) => string
  /** Label for the items being paginated (e.g., "events", "results") */
  label: string
}

export function AdminPagination({
  page,
  pageSize,
  totalCount,
  buildPageUrl,
  label,
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {totalCount} {label}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildPageUrl(page - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildPageUrl(page + 1)}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
