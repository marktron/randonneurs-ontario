"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownContent } from "@/components/markdown-content"
import { Eye, Edit3, Upload, Loader2 } from "lucide-react"
import { uploadImage } from "@/lib/actions/images"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      // Fallback: append to end
      onChange(value + text)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = value.slice(0, start) + text + value.slice(end)
    onChange(newValue)

    // Restore cursor position after the inserted text
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length
      textarea.focus()
    })
  }, [value, onChange])

  const handleImageUpload = useCallback(async (file: File) => {
    // Validate file type client-side
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Use PNG, JPEG, WebP, or GIF.")
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.")
      return
    }

    setIsUploading(true)
    const uploadingPlaceholder = `![Uploading ${file.name}...]()`

    // Insert placeholder at cursor
    insertAtCursor(uploadingPlaceholder)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "pages")

      const result = await uploadImage(formData)

      if (result.success && result.data) {
        // Replace placeholder with actual markdown image
        const markdown = `![${file.name}](${result.data.url})`
        const currentValue = textareaRef.current?.value || value
        onChange(currentValue.replace(uploadingPlaceholder, markdown))
        toast.success("Image uploaded")
      } else {
        // Remove placeholder on error
        const currentValue = textareaRef.current?.value || value
        onChange(currentValue.replace(uploadingPlaceholder, ""))
        toast.error(result.error || "Failed to upload image")
      }
    } catch {
      const currentValue = textareaRef.current?.value || value
      onChange(currentValue.replace(uploadingPlaceholder, ""))
      toast.error("Failed to upload image")
    } finally {
      setIsUploading(false)
    }
  }, [value, onChange, insertAtCursor])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(f => f.type.startsWith("image/"))

    if (imageFile) {
      handleImageUpload(imageFile)
    }
  }, [handleImageUpload])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith("image/"))

    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (file) {
        handleImageUpload(file)
      }
    }
  }, [handleImageUpload])

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? (
            <>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </>
          )}
        </Button>
      </div>

      {showPreview ? (
        <div className="min-h-[400px] rounded-md border bg-white p-4">
          {value ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      ) : (
        <div
          className="relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            className={cn(
              "!h-[500px] font-mono text-sm resize-y !field-sizing-fixed",
              isDragging && "ring-2 ring-primary ring-offset-2"
            )}
            disabled={isUploading}
          />
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-md border-2 border-dashed border-primary pointer-events-none">
              <div className="flex items-center gap-2 text-primary font-medium">
                <Upload className="h-5 w-5" />
                Drop image to upload
              </div>
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md pointer-events-none">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Uploading image...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
