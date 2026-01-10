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

interface PageEditorProps {
  slug: string
  initialTitle: string
  initialDescription: string
  initialContent: string
  isNew?: boolean
}

export function PageEditor({
  slug,
  initialTitle,
  initialDescription,
  initialContent,
  isNew = false,
}: PageEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }

    setSaving(true)
    try {
      const result = await savePage({
        slug,
        title: title.trim(),
        description: description.trim(),
        content,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">URL Slug</Label>
          <Input
            id="slug"
            value={slug}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            The page will be available at /{slug}
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
              Saving...
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
