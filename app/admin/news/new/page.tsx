import { requireAdmin } from '@/lib/auth/get-admin'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Lazy-load NewsEditor (includes MarkdownEditor and react-markdown)
const NewsEditor = dynamic(
  () => import('@/components/admin/news-editor').then((mod) => ({ default: mod.NewsEditor })),
  {
    loading: () => (
      <div className="space-y-6 max-w-4xl">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-[500px] bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
      </div>
    ),
  }
)

export default async function AdminNewNewsPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/news">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New News Item</h1>
          <p className="text-muted-foreground">Create a new notice or announcement</p>
        </div>
      </div>

      <NewsEditor isNew />
    </div>
  )
}
