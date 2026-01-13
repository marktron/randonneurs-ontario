'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Eye, GitMerge, Search, X } from 'lucide-react'
import { MergeRidersDialog, type RiderForMerge } from './merge-riders-dialog'

interface RiderWithStats {
  id: string
  slug: string
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
  created_at: string | null
  registrations: { count: number }[] | null
  results: { count: number }[] | null
}

interface RidersTableProps {
  riders: RiderWithStats[]
  searchQuery: string
}

function getGenderBadge(gender: string | null) {
  switch (gender) {
    case 'M':
      return <Badge variant="outline">M</Badge>
    case 'F':
      return <Badge variant="outline">F</Badge>
    case 'X':
      return <Badge variant="outline">X</Badge>
    default:
      return <span className="text-muted-foreground">—</span>
  }
}

export function RidersTable({ riders, searchQuery }: RidersTableProps) {
  const router = useRouter()
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)

  const selectedRiders: RiderForMerge[] = useMemo(() =>
    riders
      .filter(rider => selectedRiderIds.has(rider.id))
      .map(rider => ({
        id: rider.id,
        first_name: rider.first_name,
        last_name: rider.last_name,
        email: rider.email,
        gender: rider.gender,
      })),
    [riders, selectedRiderIds]
  )

  const allSelected = riders.length > 0 &&
    riders.every(rider => selectedRiderIds.has(rider.id))

  const someSelected = riders.some(rider => selectedRiderIds.has(rider.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRiderIds(new Set())
    } else {
      setSelectedRiderIds(new Set(riders.map(r => r.id)))
    }
  }

  const toggleSelectRider = (riderId: string) => {
    const newSelected = new Set(selectedRiderIds)
    if (newSelected.has(riderId)) {
      newSelected.delete(riderId)
    } else {
      newSelected.add(riderId)
    }
    setSelectedRiderIds(newSelected)
  }

  const clearSelection = () => {
    setSelectedRiderIds(new Set())
  }

  const handleMergeDialogClose = (open: boolean) => {
    setMergeDialogOpen(open)
    if (!open) {
      // Clear selection after dialog closes (merge was successful or cancelled)
      clearSelection()
    }
  }

  return (
    <>
      {/* Selection action bar */}
      {selectedRiderIds.size > 0 && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">
            {selectedRiderIds.size} rider{selectedRiderIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setMergeDialogOpen(true)}
              disabled={selectedRiderIds.size < 2}
            >
              <GitMerge className="h-4 w-4 mr-2" />
              Merge
            </Button>
          </div>
          <button
            onClick={clearSelection}
            className="ml-auto text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear selection
          </button>
        </div>
      )}

      {/* Search */}
      <form className="flex items-center gap-2 max-w-md mb-4">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search className="h-4 w-4" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            name="q"
            placeholder="Search by name or email..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </InputGroup>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {searchQuery && (
          <Button variant="ghost" asChild>
            <Link href="/admin/riders">Clear</Link>
          </Button>
        )}
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as unknown as HTMLInputElement).indeterminate = !allSelected && someSelected
                    }
                  }}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all riders"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead className="text-center">Registrations</TableHead>
              <TableHead className="text-center">Results</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {searchQuery ? 'No riders found matching your search' : 'No riders found'}
                </TableCell>
              </TableRow>
            ) : (
              riders.map((rider) => {
                const regCount = rider.registrations?.[0]?.count ?? 0
                const resultCount = rider.results?.[0]?.count ?? 0

                return (
                  <TableRow
                    key={rider.id}
                    className={selectedRiderIds.has(rider.id) ? 'bg-muted/50' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedRiderIds.has(rider.id)}
                        onCheckedChange={() => toggleSelectRider(rider.id)}
                        aria-label={`Select ${rider.first_name} ${rider.last_name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {rider.first_name} {rider.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rider.email || '—'}
                    </TableCell>
                    <TableCell>{getGenderBadge(rider.gender)}</TableCell>
                    <TableCell className="text-center">
                      {regCount > 0 ? (
                        <Badge variant="secondary">{regCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {resultCount > 0 ? (
                        <Badge>{resultCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {rider.created_at ? new Date(rider.created_at).toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link href={`/admin/riders/${rider.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        Showing {riders.length} riders{searchQuery ? ` matching "${searchQuery}"` : ''}.
      </p>

      <MergeRidersDialog
        selectedRiders={selectedRiders}
        open={mergeDialogOpen}
        onOpenChange={handleMergeDialogClose}
      />
    </>
  )
}
