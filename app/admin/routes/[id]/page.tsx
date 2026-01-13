import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { RouteForm } from '@/components/admin/route-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Route } from '@/types/queries'
import type { RouteOption } from '@/types/ui'

async function getRoute(id: string): Promise<RouteOption | null> {
  const { data } = await getSupabaseAdmin()
    .from('routes')
    .select('*')
    .eq('id', id)
    .single()

  if (!data) return null

  const route = data as Route
  return {
    id: route.id,
    name: route.name,
    slug: route.slug,
    chapterId: route.chapter_id,
    distanceKm: route.distance_km,
    collection: route.collection,
    description: route.description,
    rwgpsUrl: route.rwgps_id ? `https://ridewithgps.com/routes/${route.rwgps_id}` : null,
    cueSheetUrl: route.cue_sheet_url,
    notes: route.notes,
    isActive: route.is_active,
  }
}

async function getChapters() {
  const { data } = await getSupabaseAdmin()
    .from('chapters')
    .select('id, name')
    .order('name', { ascending: true })

  return data ?? []
}

interface EditRoutePageProps {
  params: Promise<{ id: string }>
}

export default async function EditRoutePage({ params }: EditRoutePageProps) {
  const { id } = await params
  await requireAdmin()

  const [route, chapters] = await Promise.all([
    getRoute(id),
    getChapters(),
  ])

  if (!route) {
    notFound()
  }

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
        <RouteForm chapters={chapters} route={route} mode="edit" />
      </div>
    </div>
  )
}
