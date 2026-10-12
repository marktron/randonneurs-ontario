import { requireAdmin } from '@/lib/auth/get-admin'
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
import {
  PublishSeasonButton,
  type PublishSeasonDraft,
} from '@/components/admin/publish-season-button'
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
import { acpSeasonOf } from '@/lib/acp-season'

const currentSeason = getCurrentSeasonLabel()
const PAGE_SIZE = 50

async function getAvailableSeasons(): Promise<string[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_event_seasons')

  if (!data || data.length === 0) return [currentSeason]

  return data.map((row: { season: number }) => row.season.toString())
}

interface DraftRow {
  id: string
  name: string
  event_date: string
}

/**
 * The chapter's drafts grouped by ACP season (Nov 1 to Oct 31, labelled by the
 * ending year), oldest season first. Ignores the season filter so a chapter's
 * November and December drafts show up with the season they belong to.
 */
async function getChapterDraftsByAcpSeason(
  chapterId: string
): Promise<{ acpSeason: number; events: PublishSeasonDraft[] }[]> {
  const { data } = await getSupabaseAdmin()
    .from('events')
    .select('id, name, event_date')
    .eq('status', 'draft')
    .eq('chapter_id', chapterId)
    .order('event_date', { ascending: true })

  const groups = new Map<number, PublishSeasonDraft[]>()
  for (const row of (data as DraftRow[] | null) ?? []) {
    const acpSeason = acpSeasonOf(row.event_date)
    const group = groups.get(acpSeason) ?? []
    group.push({ id: row.id, name: row.name, eventDate: row.event_date })
    groups.set(acpSeason, group)
  }
  return Array.from(groups, ([acpSeason, events]) => ({ acpSeason, events })).sort(
    (a, b) => a.acpSeason - b.acpSeason
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
  const selectedChapter = chapterId ? chapters.find((c) => c.id === chapterId) : undefined
  const chapterSlug = selectedChapter?.slug
  const dateFilter: DateFilter =
    params.when === 'past' || params.when === 'upcoming' ? params.when : 'all'
  const view: AdminEventsView = parseAdminEventsView(params.view)
  const page = Math.max(1, parseInt(params.page || '1', 10))
  const [{ events, totalCount }, draftSeasons] = await Promise.all([
    getAdminEvents(
      getSupabaseAdmin(),
      season,
      dateFilter,
      chapterId || undefined,
      chapterSlug,
      page,
      view === 'grid' ? null : PAGE_SIZE
    ),
    // Publishing is per chapter, so no buttons when viewing all chapters
    chapterId ? getChapterDraftsByAcpSeason(chapterId) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage event registrations and results</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {chapterId &&
            draftSeasons.map((group) => (
              <PublishSeasonButton
                key={group.acpSeason}
                acpSeason={group.acpSeason}
                chapterId={chapterId}
                chapterName={selectedChapter?.name ?? 'this chapter'}
                events={group.events}
              />
            ))}
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
