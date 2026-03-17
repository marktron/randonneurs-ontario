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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ChevronLeft, ChevronRight, Eye, GitMerge, Search, X } from 'lucide-react'
import { MergeRidersDialog, type RiderForMerge } from './merge-riders-dialog'

interface RiderWithStats {
  id: string
  slug: string
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
  member_since: number | null
  registrations: { count: number }[] | null
  results: { count: number }[] | null
  rider_memberships:
    | {
        season: number
        membership_type: string
        chapters: { name: string } | null
      }[]
    | null
}

interface Chapter {
  id: string
  name: string
}

interface RidersTableProps {
  riders: RiderWithStats[]
  searchQuery: string
  chapters: Chapter[]
  chapterFilter: string | null
  page: number
  pageSize: number
  totalCount: number
}

// Match the order used in the main site navbar
const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

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

function buildPageUrl(page: number, searchQuery: string, chapterFilter: string | null) {
  const params = new URLSearchParams()
  if (searchQuery) params.set('q', searchQuery)
  if (chapterFilter) params.set('chapter', chapterFilter)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/admin/riders${qs ? `?${qs}` : ''}`
}

export function RidersTable({
  riders,
  searchQuery,
  chapters,
  chapterFilter,
  page,
  pageSize,
  totalCount,
}: RidersTableProps) {
  const router = useRouter()
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)

  const mainChapters = CHAPTER_ORDER.map((name) => chapters.find((c) => c.name === name)).filter(
    (c): c is Chapter => c !== undefined
  )

  const handleChapterChange = (value: string) => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (value !== 'all') params.set('chapter', value)
    const qs = params.toString()
    router.push(`/admin/riders${qs ? `?${qs}` : ''}`)
  }

  const selectedRiders: RiderForMerge[] = useMemo(
    () =>
      riders
        .filter((rider) => selectedRiderIds.has(rider.id))
        .map((rider) => ({
          id: rider.id,
          first_name: rider.first_name,
          last_name: rider.last_name,
          email: rider.email,
          gender: rider.gender,
        })),
    [riders, selectedRiderIds]
  )

  const allSelected = riders.length > 0 && riders.every((rider) => selectedRiderIds.has(rider.id))

  const someSelected = riders.some((rider) => selectedRiderIds.has(rider.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRiderIds(new Set())
    } else {
      setSelectedRiderIds(new Set(riders.map((r) => r.id)))
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
            type="button"
            onClick={clearSelection}
            className="ml-auto text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear selection
          </button>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-4 mb-4">
        <form className="flex items-center gap-2 max-w-md" role="search">
          {chapterFilter && <input type="hidden" name="chapter" value={chapterFilter} />}
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <Search className="h-4 w-4" aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              name="q"
              placeholder="Search by name or email…"
              aria-label="Search riders by name or email"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </InputGroup>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {searchQuery && (
            <Button variant="ghost" asChild>
              <Link
                href={chapterFilter ? `/admin/riders?chapter=${chapterFilter}` : '/admin/riders'}
              >
                Clear
              </Link>
            </Button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Chapter:</span>
          <Select value={chapterFilter || 'all'} onValueChange={handleChapterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue>
                {chapterFilter
                  ? chapters.find((c) => c.name === chapterFilter)?.name || chapterFilter
                  : 'All Chapters'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              <SelectItem value="all">All Chapters</SelectItem>
              <SelectSeparator />
              {mainChapters.map((chapter) => (
                <SelectItem key={chapter.id} value={chapter.name}>
                  {chapter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      ;(el as unknown as HTMLInputElement).indeterminate =
                        !allSelected && someSelected
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
              <TableHead>Chapter</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
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
                    <TableCell className="text-muted-foreground">{rider.email || '—'}</TableCell>
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
                      {(() => {
                        const latest = rider.rider_memberships
                          ?.slice()
                          .sort((a, b) => b.season - a.season)[0]
                        return latest?.chapters?.name ? (
                          <span className="text-sm">{latest.chapters.name}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const currentSeason = parseInt(
                          process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026',
                          10
                        )
                        const currentMembership = rider.rider_memberships?.find(
                          (m) => m.season === currentSeason
                        )
                        return currentMembership ? (
                          <span className="text-sm">{currentMembership.membership_type}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      {rider.member_since ?? <span className="text-muted-foreground">—</span>}
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

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of{' '}
          {totalCount} riders{searchQuery ? ` matching "${searchQuery}"` : ''}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageUrl(page - 1, searchQuery, chapterFilter)}>
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
            Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))}
          </span>
          {page * pageSize < totalCount ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageUrl(page + 1, searchQuery, chapterFilter)}>
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

      <MergeRidersDialog
        selectedRiders={selectedRiders}
        open={mergeDialogOpen}
        onOpenChange={handleMergeDialogClose}
      />
    </>
  )
}
