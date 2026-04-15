import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { applyRiderSearchFilter } from '@/lib/utils/rider-search'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { RiderWithStats } from '@/types/queries'

const PAGE_SIZE = 50

// Lazy-load RidersTable (large table component)
const RidersTable = dynamic(
  () => import('@/components/admin/riders-table').then((mod) => ({ default: mod.RidersTable })),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-96 bg-muted animate-pulse rounded" />
      </div>
    ),
  }
)

async function getChapters() {
  const { data } = await getSupabaseAdmin().from('chapters').select('id, name').order('name')

  return data ?? []
}

async function getRiders(
  search?: string,
  chapterFilter?: string,
  page: number = 1
): Promise<{ riders: RiderWithStats[]; totalCount: number }> {
  const selectQuery = `
      id,
      slug,
      first_name,
      last_name,
      email,
      gender,
      member_since,
      registrations (count),
      results (count),
      rider_memberships (season, membership_type, chapters (name))
`

  if (chapterFilter) {
    // Use RPC to filter by latest membership chapter in the database
    const offset = (page - 1) * PAGE_SIZE
    const { data: rpcData } = await getSupabaseAdmin().rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterFilter,
      p_search: search || undefined,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    })

    if (!rpcData?.length) {
      return { riders: [], totalCount: 0 }
    }

    const totalCount = Number(rpcData[0].total_count)
    const riderIds = rpcData.map((r: { rider_id: string }) => r.rider_id)

    // Fetch full rider data (with nested counts/memberships) for the page
    const { data } = await getSupabaseAdmin()
      .from('riders')
      .select(selectQuery)
      .in('id', riderIds)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    return { riders: (data as RiderWithStats[]) ?? [], totalCount }
  }

  // No chapter filter — use Supabase range for efficient pagination
  let countQuery = getSupabaseAdmin().from('riders').select('id', { count: 'exact', head: true })

  if (search) {
    countQuery = applyRiderSearchFilter(countQuery, search)
  }

  const { count } = await countQuery
  const totalCount = count ?? 0

  const offset = (page - 1) * PAGE_SIZE
  let query = getSupabaseAdmin()
    .from('riders')
    .select(selectQuery)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    query = applyRiderSearchFilter(query, search)
  }

  const { data } = await query
  const riders = (data as RiderWithStats[]) ?? []

  return { riders, totalCount }
}

interface AdminRidersPageProps {
  searchParams: Promise<{ q?: string; chapter?: string; page?: string }>
}

export default async function AdminRidersPage({ searchParams }: AdminRidersPageProps) {
  const admin = await requireAdmin()

  // Only full admins can access this page
  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const params = await searchParams
  const search = params.q || ''
  const chapterFilter = params.chapter || null
  const page = Math.max(1, parseInt(params.page || '1', 10))

  const [{ riders, totalCount }, chapters] = await Promise.all([
    getRiders(search || undefined, chapterFilter || undefined, page),
    getChapters(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Members</h1>
        <p className="text-muted-foreground">
          View registered members and their participation history
        </p>
      </div>

      <RidersTable
        riders={riders}
        searchQuery={search}
        chapters={chapters}
        chapterFilter={chapterFilter}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
      />
    </div>
  )
}
