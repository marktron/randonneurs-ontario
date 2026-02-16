import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { applyRiderSearchFilter } from '@/lib/utils/rider-search'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { RiderWithStats } from '@/types/queries'

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

async function getRiders(search?: string): Promise<RiderWithStats[]> {
  let query = getSupabaseAdmin()
    .from('riders')
    .select(
      `
      id,
      slug,
      first_name,
      last_name,
      email,
      gender,
      created_at,
      registrations (count),
      results (count),
      memberships (type, season)
    `
    )
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .limit(200)

  if (search) {
    query = applyRiderSearchFilter(query, search)
  }

  const { data } = await query

  return (data as RiderWithStats[]) ?? []
}

interface AdminRidersPageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function AdminRidersPage({ searchParams }: AdminRidersPageProps) {
  const admin = await requireAdmin()

  // Only full admins can access this page
  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const params = await searchParams
  const search = params.q || ''

  const riders = await getRiders(search || undefined)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Riders</h1>
        <p className="text-muted-foreground">
          View registered riders and their participation history
        </p>
      </div>

      <RidersTable riders={riders} searchQuery={search} />
    </div>
  )
}
