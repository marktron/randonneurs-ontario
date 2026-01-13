import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getActiveRoutes } from '@/lib/data/routes'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { EventDetailForEdit } from '@/types/queries'
import type { EventFormData } from '@/components/admin/event-form'

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

async function getEvent(eventId: string): Promise<EventFormData | null> {
  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select(`
      id,
      name,
      chapter_id,
      route_id,
      event_type,
      distance_km,
      event_date,
      start_time,
      start_location,
      description,
      image_url
    `)
    .eq('id', eventId)
    .single()

  if (!event) return null

  const e = event as EventDetailForEdit
  return {
    id: e.id,
    name: e.name,
    chapterId: e.chapter_id,
    routeId: e.route_id,
    eventType: e.event_type,
    distanceKm: e.distance_km,
    eventDate: e.event_date,
    startTime: e.start_time,
    startLocation: e.start_location,
    description: e.description,
    imageUrl: e.image_url,
  }
}

interface EditEventPageProps {
  params: Promise<{ id: string }>
}

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id } = await params
  await requireAdmin()

  const [event, chapters, routes] = await Promise.all([
    getEvent(id),
    getChapters(),
    getActiveRoutes(),
  ])

  if (!event) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Event
      </Link>

      <div className="max-w-2xl">
        <EventForm
          chapters={chapters}
          routes={routes}
          event={event}
          mode="edit"
        />
      </div>
    </div>
  )
}
