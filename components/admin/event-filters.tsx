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

interface Chapter {
  id: string
  name: string
}

interface EventFiltersProps {
  timeFilter: string
  chapterId: string | null
  chapters: Chapter[]
}

// Match the order used in the main site navbar
const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

function buildFilterUrl(timeFilter: string, chapterId: string | null, explicitAll: boolean = false) {
  const params = new URLSearchParams()
  if (timeFilter !== 'all') params.set('filter', timeFilter)
  if (chapterId) {
    params.set('chapter', chapterId)
  } else if (explicitAll) {
    // Explicitly set 'all' to override admin's default chapter
    params.set('chapter', 'all')
  }
  const qs = params.toString()
  return `/admin/events${qs ? `?${qs}` : ''}`
}

export function EventFilters({ timeFilter, chapterId, chapters }: EventFiltersProps) {
  const router = useRouter()

  // Separate chapters into main chapters and others
  const mainChapters = CHAPTER_ORDER
    .map(name => chapters.find(c => c.name === name))
    .filter((c): c is Chapter => c !== undefined)

  const otherChapters = chapters
    .filter(c => !CHAPTER_ORDER.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleTimeChange = (value: string) => {
    router.push(buildFilterUrl(value, chapterId))
  }

  const handleChapterChange = (value: string) => {
    const isAll = value === 'all'
    router.push(buildFilterUrl(timeFilter, isAll ? null : value, isAll))
  }

  // Find current chapter name for display
  const currentChapterName = chapterId
    ? chapters.find(c => c.id === chapterId)?.name || 'Unknown'
    : 'All Chapters'

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Time:</span>
        <Select value={timeFilter} onValueChange={handleTimeChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
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
    </div>
  )
}
