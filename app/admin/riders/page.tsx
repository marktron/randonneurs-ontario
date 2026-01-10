import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { applyRiderSearchFilter } from '@/lib/utils/rider-search'
import { redirect } from 'next/navigation'
import { RidersTable } from '@/components/admin/riders-table'

interface RiderWithStats {
  id: string
  slug: string
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
  created_at: string
  registrations: { count: number }[]
  results: { count: number }[]
}

async function getRiders(search?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (getSupabaseAdmin().from('riders') as any)
    .select(`
      id,
      slug,
      first_name,
      last_name,
      email,
      gender,
      created_at,
      registrations (count),
      results (count)
    `)
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

  // Only admins can access this page
  if (admin.role !== 'admin') {
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
