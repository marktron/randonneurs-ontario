'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownContent } from '@/components/markdown-content'
import { Eye, Edit3, Upload, Loader2, AlertCircle } from 'lucide-react'
import { uploadFile } from '@/lib/actions/images'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function isImageType(type: string) {
  return type.startsWith('image/')
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}

export function MarkdownEditor({ value, onChange, placeholder, label }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        onChange(valueRef.current + text)
        return
      }

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = valueRef.current.slice(0, start) + text + valueRef.current.slice(end)
      onChange(newValue)

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length
        textarea.focus()
      })
    },
    [onChange]
  )

  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploadError(null)

      if (!ALLOWED_TYPES.includes(file.type)) {
        const msg = 'Invalid file type. Use images, PDF, Word, or Excel files.'
        setUploadError(msg)
        toast.error(msg)
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        const msg = 'File too large. Maximum size is 10MB.'
        setUploadError(msg)
        toast.error(msg)
        return
      }

      setIsUploading(true)
      const isImage = isImageType(file.type)
      const uploadingPlaceholder = isImage
        ? `![Uploading ${file.name}...]()`
        : `[Uploading ${file.name}...]()`

      insertAtCursor(uploadingPlaceholder)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', 'pages')

        const result = await uploadFile(formData)

        if (result.success && result.data) {
          const markdown = isImage
            ? `![${file.name}](${result.data.url})`
            : `[${file.name}](${result.data.url})`
          onChange(valueRef.current.replace(uploadingPlaceholder, markdown))
          toast.success(isImage ? 'Image uploaded' : 'File uploaded')
        } else {
          onChange(valueRef.current.replace(uploadingPlaceholder, ''))
          const msg = result.error || 'Failed to upload file'
          setUploadError(msg)
          toast.error(msg)
          console.error('Upload failed:', msg)
        }
      } catch (error) {
        onChange(valueRef.current.replace(uploadingPlaceholder, ''))
        const msg = 'Failed to upload file'
        setUploadError(msg)
        toast.error(msg)
        console.error('Upload error:', error)
      } finally {
        setIsUploading(false)
      }
    },
    [onChange, insertAtCursor]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      const uploadableFile = files.find((f) => ALLOWED_TYPES.includes(f.type))

      if (uploadableFile) {
        handleFileUpload(uploadableFile)
      } else if (files.length > 0) {
        const msg = 'Invalid file type. Use images, PDF, Word, or Excel files.'
        setUploadError(msg)
        toast.error(msg)
      }
    },
    [handleFileUpload]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items)
      const imageItem = items.find((item) => item.type.startsWith('image/'))

      if (imageItem) {
        e.preventDefault()
        const file = imageItem.getAsFile()
        if (file) {
          handleFileUpload(file)
        }
      }
    },
    [handleFileUpload]
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {label && <Label>{label}</Label>}
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
          {uploadError && (
            <Alert variant="destructive" className="mb-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            className={cn(
              '!h-[500px] font-mono text-sm resize-y !field-sizing-fixed',
              isDragging && 'ring-2 ring-primary ring-offset-2'
            )}
            disabled={isUploading}
          />
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-md border-2 border-dashed border-primary pointer-events-none">
              <div className="flex items-center gap-2 text-primary font-medium">
                <Upload className="h-5 w-5" />
                Drop file to upload
              </div>
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md pointer-events-none">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Uploading file...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
