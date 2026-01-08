import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { RouteForm } from '@/components/admin/route-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { RouteOption } from '@/types/ui'

async function getRoute(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('routes') as any)
    .select('*')
    .eq('id', id)
    .single()

  return data as RouteOption | null
}

async function getChapters() {
  const { data } = await supabaseAdmin
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
