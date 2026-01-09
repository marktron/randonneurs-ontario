"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"

interface Chapter {
  id: string
  name: string
  slug: string
}

interface ResultsFiltersProps {
  seasons: number[]
  chapters: Chapter[]
}

// Match the order used in the main site navbar
const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

export function ResultsFilters({ seasons, chapters }: ResultsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentSeason = searchParams.get("season") || "all"
  const currentChapter = searchParams.get("chapter") || "all"

  // Separate chapters into main chapters and others
  const mainChapters = CHAPTER_ORDER
    .map(name => chapters.find(c => c.name === name))
    .filter((c): c is Chapter => c !== undefined)

  const otherChapters = chapters
    .filter(c => !CHAPTER_ORDER.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Find current chapter name for display
  const currentChapterName = currentChapter !== "all"
    ? chapters.find(c => c.id === currentChapter)?.name || "Unknown"
    : "All Chapters"

  function updateFilters(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())

    if (value === "all") {
      params.delete(key)
    } else {
      params.set(key, value)
    }

    const queryString = params.toString()
    router.push(`/admin/results${queryString ? `?${queryString}` : ""}`)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Season:</span>
        <Select
          value={currentSeason}
          onValueChange={(value) => updateFilters("season", value)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">All</SelectItem>
            <SelectSeparator />
            {seasons.map((season) => (
              <SelectItem key={season} value={season.toString()}>
                {season}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Chapter:</span>
        <Select
          value={currentChapter}
          onValueChange={(value) => updateFilters("chapter", value)}
        >
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
