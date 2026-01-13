import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getActiveRoutes } from '@/lib/data/routes'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Lazy-load EventForm (complex form component)
const EventForm = dynamic(() => import('@/components/admin/event-form').then(mod => ({ default: mod.EventForm })), {
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

export default async function NewEventPage() {
  const admin = await requireAdmin()
  const [chapters, routes] = await Promise.all([
    getChapters(),
    getActiveRoutes(),
  ])

  return (
    <div className="space-y-6">
      <Link
        href="/admin/events"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Events
      </Link>

      <div className="max-w-2xl">
        <EventForm
          chapters={chapters}
          routes={routes}
          defaultChapterId={admin.chapter_id}
        />
      </div>
    </div>
  )
}
