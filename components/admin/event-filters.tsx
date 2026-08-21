'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectLabel,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getCurrentSeasonLabel } from '@/lib/season'
import { ListIcon, CalendarDaysIcon } from 'lucide-react'

interface Chapter {
  id: string
  name: string
}

export type DateFilter = 'all' | 'past' | 'upcoming'
export type AdminEventsView = 'list' | 'grid'

interface EventFiltersProps {
  season: string
  chapterId: string | null
  chapters: Chapter[]
  seasons: string[]
  dateFilter: DateFilter
  view: AdminEventsView
}

// Match the order used in the main site navbar
const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

const currentSeason = getCurrentSeasonLabel()

function buildFilterUrl(
  season: string,
  chapterId: string | null,
  dateFilter: DateFilter,
  view: AdminEventsView,
  explicitAll: boolean = false
) {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('season', season)
  if (chapterId) {
    params.set('chapter', chapterId)
  } else if (explicitAll) {
    // Explicitly set 'all' to override admin's default chapter
    params.set('chapter', 'all')
  }
  if (dateFilter !== 'all') params.set('when', dateFilter)
  if (view !== 'list') params.set('view', view)
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}

export function EventFilters({
  season,
  chapterId,
  chapters,
  seasons,
  dateFilter,
  view,
}: EventFiltersProps) {
  const router = useRouter()

  // Separate chapters into main chapters and others
  const mainChapters = CHAPTER_ORDER.map((name) => chapters.find((c) => c.name === name)).filter(
    (c): c is Chapter => c !== undefined
  )

  const otherChapters = chapters
    .filter((c) => !CHAPTER_ORDER.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSeasonChange = (value: string) => {
    router.push(buildFilterUrl(value, chapterId, dateFilter, view))
  }

  const handleChapterChange = (value: string) => {
    const isAll = value === 'all'
    router.push(buildFilterUrl(season, isAll ? null : value, dateFilter, view, isAll))
  }

  const handleDateFilterChange = (value: string) => {
    if (!value) return // ToggleGroup sends empty string on re-click; ignore it
    router.push(buildFilterUrl(season, chapterId, value as DateFilter, view))
  }

  const handleViewChange = (value: string) => {
    if (value !== 'list' && value !== 'grid') return
    router.push(buildFilterUrl(season, chapterId, dateFilter, value))
  }

  // Find current chapter name for display
  const currentChapterName = chapterId
    ? chapters.find((c) => c.id === chapterId)?.name || 'Unknown'
    : 'All Chapters'

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Season:</span>
        <Select value={season} onValueChange={handleSeasonChange}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {seasons.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Chapter:</span>
        <Select value={chapterId || 'all'} onValueChange={handleChapterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue>{currentChapterName}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">All Chapters</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Chapters</SelectLabel>
              {mainChapters.map((chapter) => (
                <SelectItem key={chapter.id} value={chapter.id}>
                  {chapter.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {otherChapters.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  {otherChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        type="single"
        value={dateFilter}
        onValueChange={handleDateFilterChange}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="past">Past</ToggleGroupItem>
        <ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
        <ToggleGroupItem value="all">All events</ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        type="single"
        value={view}
        onValueChange={handleViewChange}
        variant="outline"
        size="sm"
        aria-label="Events view"
        className="sm:ml-auto"
      >
        <ToggleGroupItem value="list" aria-label="List view">
          <ListIcon className="size-4" />
          <span className="ml-1 text-sm">List</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label="Grid view">
          <CalendarDaysIcon className="size-4" />
          <span className="ml-1 text-sm">Grid</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
