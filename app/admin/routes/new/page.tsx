import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Lazy-load RouteForm (complex form component)
const RouteForm = dynamic(() => import('@/components/admin/route-form').then(mod => ({ default: mod.RouteForm })), {
  loading: () => (
    <div className="space-y-6">
      <div className="h-10 bg-muted animate-pulse rounded" />
      <div className="h-10 bg-muted animate-pulse rounded" />
      <div className="h-32 bg-muted animate-pulse rounded" />
    </div>
  ),
})

async function getChapters() {
  const { data } = await getSupabaseAdmin()
    .from('chapters')
    .select('id, name')
    .order('name', { ascending: true })

  return data ?? []
}

export default async function NewRoutePage() {
  await requireAdmin()
  const chapters = await getChapters()

  return (
    <div className="space-y-6">
      <Link
        href="/admin/routes"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Routes
      </Link>

      <div className="max-w-2xl">
        <RouteForm chapters={chapters} mode="create" />
      </div>
    </div>
  )
}
