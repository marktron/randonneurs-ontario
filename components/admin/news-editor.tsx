'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createNewsItem, updateNewsItem } from '@/lib/actions/news'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'

// Lazy-load MarkdownEditor (includes react-markdown and remark-gfm)
const MarkdownEditor = dynamic(
  () => import('./markdown-editor').then((mod) => ({ default: mod.MarkdownEditor })),
  {
    loading: () => <div className="h-[500px] rounded-md border bg-muted animate-pulse" />,
  }
)

interface NewsEditorProps {
  initialId?: string
  initialTitle?: string
  initialBody?: string
  initialTeaser?: string
  initialIsPublished?: boolean
  isNew?: boolean
}

export function NewsEditor({
  initialId,
  initialTitle = '',
  initialBody = '',
  initialTeaser = '',
  initialIsPublished = false,
  isNew = false,
}: NewsEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [teaser, setTeaser] = useState(initialTeaser)
  const [isPublished, setIsPublished] = useState(initialIsPublished)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const result = await createNewsItem({
          title: title.trim(),
          body: body.trim(),
          teaser: teaser.trim(),
          is_published: isPublished,
        })

        if (result.success) {
          toast.success('News item created')
          router.push(`/admin/news/${result.data?.id}`)
        } else {
          toast.error(result.error || 'Failed to create news item')
        }
      } else {
        if (!initialId) return

        const result = await updateNewsItem(initialId, {
          title: title.trim(),
          body: body.trim(),
          teaser: teaser.trim(),
          is_published: isPublished,
        })

        if (result.success) {
          toast.success('News item saved')
          router.refresh()
        } else {
          toast.error(result.error || 'Failed to save news item')
        }
      }
    } catch {
      toast.error('An error occurred while saving')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="News item title"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="teaser">Teaser</Label>
        <Input
          id="teaser"
          value={teaser}
          onChange={(e) => setTeaser(e.target.value)}
          placeholder="Optional one-line summary for the homepage"
        />
        <p className="text-xs text-muted-foreground">
          If left blank, the first few lines of the content will be used.
        </p>
      </div>

      <MarkdownEditor
        label="Content (Markdown)"
        value={body}
        onChange={setBody}
        placeholder="Write your news content here using Markdown..."
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
          <Label htmlFor="published">Published</Label>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isNew ? 'Creating...' : 'Saving...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isNew ? 'Create Item' : 'Save Changes'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
