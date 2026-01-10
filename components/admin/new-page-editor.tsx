"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MarkdownEditor } from "./markdown-editor"
import { savePage } from "@/lib/actions/pages"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

export function NewPageEditor() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)

  // Auto-generate slug from title
  function handleTitleChange(newTitle: string) {
    setTitle(newTitle)
    // Only auto-generate slug if user hasn't manually edited it
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(newTitle))
    }
  }

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim()
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }

    if (!slug.trim()) {
      toast.error("Slug is required")
      return
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast.error("Slug can only contain lowercase letters, numbers, and hyphens")
      return
    }

    setSaving(true)
    try {
      const result = await savePage({
        slug: slug.trim(),
        title: title.trim(),
        description: description.trim(),
        content,
      })

      if (result.success) {
        toast.success("Page created")
        router.push(`/admin/pages/${slug}`)
      } else {
        toast.error(result.error || "Failed to create page")
      }
    } catch {
      toast.error("An error occurred while creating the page")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Page title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">URL Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="page-slug"
          />
          <p className="text-xs text-muted-foreground">
            The page will be available at /{slug || "..."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description for SEO and page header"
        />
      </div>

      <div className="space-y-2">
        <Label>Content (Markdown)</Label>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Write your page content here using Markdown..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Create Page
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
