import { requireAdmin } from '@/lib/auth/get-admin'
import { isSuperAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getChapters } from '@/lib/actions/admin-users'
import { getAdminEvents } from '@/lib/admin/admin-events-query'
import { EventsTable } from '@/components/admin/events-table'
import { Button } from '@/components/ui/button'
import {
  EventFilters,
  type DateFilter,
  type AdminEventsView,
} from '@/components/admin/event-filters'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { PublishSeasonButton } from '@/components/admin/publish-season-button'
import { AdminEventsGrid } from '@/components/admin/admin-events-grid'
import { mapEventForGrid } from '@/lib/admin/map-event-for-grid'
import {
  buildEventDetailUrl,
  buildPageUrl,
  parseAdminEventsView,
} from '@/lib/admin/event-list-urls'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getCurrentSeasonLabel } from '@/lib/season'

const currentSeason = getCurrentSeasonLabel()
const PAGE_SIZE = 50

async function getAvailableSeasons(): Promise<string[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_event_seasons')

  if (!data || data.length === 0) return [currentSeason]

  return data.map((row: { season: number }) => row.season.toString())
}

interface DraftCountRow {
  chapter_id: string
  chapters: { name: string } | null
}

/** Drafts per chapter for the season (all chapters, regardless of the chapter filter). */
async function getDraftCountsBySeason(
  season: string
): Promise<{ chapterName: string; count: number }[]> {
  const { data } = await getSupabaseAdmin()
    .from('events')
    .select('chapter_id, chapters (name)')
    .eq('status', 'draft')
    .gte('event_date', `${season}-01-01`)
    .lte('event_date', `${season}-12-31`)

  const counts = new Map<string, number>()
  for (const row of (data as DraftCountRow[] | null) ?? []) {
    const name = row.chapters?.name ?? 'Unknown'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.from(counts, ([chapterName, count]) => ({ chapterName, count })).sort((a, b) =>
    a.chapterName.localeCompare(b.chapterName)
  )
}

interface AdminEventsPageProps {
  searchParams: Promise<{
    season?: string
    chapter?: string
    page?: string
    when?: string
    view?: string
  }>
}

export default async function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  const [admin, params, chapters, seasons] = await Promise.all([
    requireAdmin(),
    searchParams,
    getChapters(),
    getAvailableSeasons(),
  ])

  const season = params.season || currentSeason
  // Use URL param if set, otherwise default to admin's chapter (if they have one)
  // 'all' means explicitly show all chapters (overrides admin default)
  const chapterId = params.chapter === 'all' ? null : (params.chapter ?? admin.chapter_id ?? null)
  const chapterSlug = chapterId ? chapters.find((c) => c.id === chapterId)?.slug : undefined
  const dateFilter: DateFilter =
    params.when === 'past' || params.when === 'upcoming' ? params.when : 'all'
  const view: AdminEventsView = parseAdminEventsView(params.view)
  const page = Math.max(1, parseInt(params.page || '1', 10))
  const [{ events, totalCount }, draftCounts] = await Promise.all([
    getAdminEvents(
      getSupabaseAdmin(),
      season,
      dateFilter,
      chapterId || undefined,
      chapterSlug,
      page,
      view === 'grid' ? null : PAGE_SIZE
    ),
    isSuperAdmin(admin.role) ? getDraftCountsBySeason(season) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage event registrations and results</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {isSuperAdmin(admin.role) && (
            <PublishSeasonButton season={Number(season)} draftCounts={draftCounts} />
          )}
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Link>
          </Button>
        </div>
      </div>

      <EventFilters
        season={season}
        chapterId={chapterId}
        chapters={chapters}
        seasons={seasons}
        dateFilter={dateFilter}
        view={view}
      />

      {view === 'grid' ? (
        events.length === 0 ? (
          <p className="rounded-md border p-8 text-center text-muted-foreground">No events found</p>
        ) : (
          <AdminEventsGrid
            events={events.map(mapEventForGrid)}
            season={season}
            chapterId={chapterId}
            dateFilter={dateFilter}
            view={view}
          />
        )
      ) : (
        <>
          <EventsTable
            events={events}
            buildEventDetailUrl={(eventId) =>
              buildEventDetailUrl(eventId, season, chapterId, dateFilter, view)
            }
          />
          {totalCount > 0 && (
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              buildPageUrl={(p) => buildPageUrl(p, season, params.chapter, dateFilter, view)}
              label="events"
            />
          )}
        </>
      )}
    </div>
  )
}
