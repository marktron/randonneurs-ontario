import { requireAdmin } from '@/lib/auth/get-admin'
import { getNewsItem } from '@/lib/data/news'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewsDeleteButton } from '@/components/admin/news-delete-button'

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

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminEditNewsPage({ params }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const item = await getNewsItem(id)

  if (!item) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/news">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit News Item</h1>
            <p className="text-muted-foreground">{item.title}</p>
          </div>
        </div>
        <NewsDeleteButton id={item.id} title={item.title} />
      </div>

      <NewsEditor
        initialId={item.id}
        initialTitle={item.title}
        initialBody={item.body}
        initialIsPublished={item.is_published}
        initialSortOrder={item.sort_order}
      />
    </div>
  )
}
