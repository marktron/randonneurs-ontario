"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HeaderImagePicker } from "./header-image-picker"
import { savePage } from "@/lib/actions/pages"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

// Lazy-load MarkdownEditor (includes react-markdown and remark-gfm)
const MarkdownEditor = dynamic(() => import("./markdown-editor").then(mod => ({ default: mod.MarkdownEditor })), {
  loading: () => (
    <div className="h-[500px] rounded-md border bg-muted animate-pulse" />
  ),
})

interface PageEditorProps {
  initialSlug?: string
  initialTitle?: string
  initialDescription?: string
  initialContent?: string
  initialHeaderImage?: string
  isNew?: boolean
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export function PageEditor({
  initialSlug = "",
  initialTitle = "",
  initialDescription = "",
  initialContent = "",
  initialHeaderImage,
  isNew = false,
}: PageEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [slug, setSlug] = useState(initialSlug)
  const [description, setDescription] = useState(initialDescription)
  const [content, setContent] = useState(initialContent)
  const [headerImage, setHeaderImage] = useState<string | undefined>(initialHeaderImage)
  const [saving, setSaving] = useState(false)

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle)
    // Auto-generate slug only for new pages and only if user hasn't manually edited it
    if (isNew && (!slug || slug === generateSlug(title))) {
      setSlug(generateSlug(newTitle))
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }

    if (isNew) {
      if (!slug.trim()) {
        toast.error("Slug is required")
        return
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        toast.error("Slug can only contain lowercase letters, numbers, and hyphens")
        return
      }
    }

    setSaving(true)
    try {
      const result = await savePage({
        slug: slug.trim(),
        title: title.trim(),
        description: description.trim(),
        content: content.trim(),
        headerImage: headerImage?.trim(),
      })

      if (result.success) {
        toast.success(isNew ? "Page created" : "Page saved")
        if (isNew) {
          router.push(`/admin/pages/${slug}`)
        }
        router.refresh()
      } else {
        toast.error(result.error || "Failed to save page")
      }
    } catch {
      toast.error("An error occurred while saving")
    } finally {
      setSaving(false)
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ""

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Page title"
        />
        {!isNew && (
          <p className="text-xs text-muted-foreground">
            The page will be available at {siteUrl}/{slug}
          </p>
        )}
      </div>

      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="slug">URL Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="page-slug"
          />
          <p className="text-xs text-muted-foreground">
            The page will be available at {siteUrl}/{slug || "..."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description for SEO and page header"
        />
      </div>

      <HeaderImagePicker value={headerImage} onChange={setHeaderImage} />

      <MarkdownEditor
        label="Content (Markdown)"
        value={content}
        onChange={setContent}
        placeholder="Write your page content here using Markdown..."
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isNew ? "Creating..." : "Saving..."}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isNew ? "Create Page" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
