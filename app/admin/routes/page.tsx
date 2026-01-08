import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { RoutesTable } from '@/components/admin/routes-table'
import type { RouteWithChapter } from '@/types/ui'

async function getRoutes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('routes') as any)
    .select(`
      id,
      name,
      slug,
      chapter_id,
      distance_km,
      collection,
      description,
      rwgps_id,
      cue_sheet_url,
      notes,
      is_active,
      chapters (id, name)
    `)
    .order('name', { ascending: true })

  return (data as RouteWithChapter[]) ?? []
}

async function getChapters() {
  const { data } = await supabaseAdmin
    .from('chapters')
    .select('id, name')
    .order('name', { ascending: true })

  return data ?? []
}

export default async function AdminRoutesPage() {
  const [admin, routes, chapters] = await Promise.all([
    requireAdmin(),
    getRoutes(),
    getChapters(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Routes</h1>
          <p className="text-muted-foreground">
            Manage route definitions and RWGPS links
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/routes/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Route
          </Link>
        </Button>
      </div>

      <RoutesTable
        routes={routes}
        chapters={chapters}
        defaultChapterId={admin.chapter_id}
      />
    </div>
  )
}
