import { requireAdmin } from '@/lib/auth/get-admin'
import { getPage } from '@/lib/content'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'

// Lazy-load PageEditor (includes MarkdownEditor and react-markdown)
const PageEditor = dynamic(() => import('@/components/admin/page-editor').then(mod => ({ default: mod.PageEditor })), {
  loading: () => (
    <div className="space-y-6 max-w-4xl">
      <div className="h-10 bg-muted animate-pulse rounded" />
      <div className="h-10 bg-muted animate-pulse rounded" />
      <div className="h-[500px] bg-muted animate-pulse rounded" />
    </div>
  ),
})

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function AdminEditPagePage({ params }: PageProps) {
  await requireAdmin()
  const { slug } = await params
  const page = getPage(slug)

  if (!page) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/pages">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Page</h1>
            <p className="text-muted-foreground">
              {page.title}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/${slug}`} target="_blank">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Page
          </Link>
        </Button>
      </div>

      <PageEditor
        initialSlug={slug}
        initialTitle={page.title}
        initialDescription={page.description}
        initialContent={page.content}
        initialHeaderImage={page.headerImage}
      />
    </div>
  )
}
