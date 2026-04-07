'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Upload, X, ImageIcon, AlertCircle } from 'lucide-react'
import { createImageUploadUrl, confirmImageUpload } from '@/lib/actions/images'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { compressImageForUpload } from '@/lib/image-compression'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  /** Current image URL (if editing) */
  value?: string | null
  /** Callback when image is uploaded or cleared */
  onChange: (url: string | null) => void
  /** Folder to upload to (e.g., 'events', 'pages') */
  folder?: string
  /** Whether the component is disabled */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]

export function ImageUpload({
  value,
  onChange,
  folder = 'general',
  disabled = false,
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed: JPEG, PNG, WebP, GIF, HEIC`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 10MB`
    }
    return null
  }

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }

      setError(null)
      setIsUploading(true)

      try {
        // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
        let uploadFile: File
        try {
          uploadFile = await compressImageForUpload(file)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to upload image')
          return
        }

        // 1. Mint a signed upload URL (avoids the Server Action body limit)
        const signed = await createImageUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          folder,
        })

        if (!signed.success || !signed.data) {
          setError(signed.error || 'Failed to upload image')
          return
        }

        // 2. Upload directly to Supabase Storage
        const supabase = createSupabaseBrowserClient()
        const { error: uploadError } = await supabase.storage
          .from('images')
          .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, uploadFile, {
            contentType: uploadFile.type,
            upsert: false,
          })

        if (uploadError) {
          setError(uploadError.message || 'Failed to upload image')
          return
        }

        // 3. Persist metadata
        const confirmed = await confirmImageUpload({
          storagePath: signed.data.storagePath,
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          altText: altText || null,
        })

        if (!confirmed.success || !confirmed.data) {
          setError(confirmed.error || 'Failed to upload image')
          return
        }

        onChange(confirmed.data.url)
        setAltText('')
        toast.success('Image uploaded successfully')
      } catch (err) {
        console.error('Upload error:', err)
        setError('An unexpected error occurred')
      } finally {
        setIsUploading(false)
      }
    },
    [folder, altText, onChange]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled && !isUploading) {
        setIsDragging(true)
      }
    },
    [disabled, isUploading]
  )

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

      if (disabled || isUploading) return

      const file = e.dataTransfer.files?.[0]
      if (file) {
        handleUpload(file)
      }
    },
    [disabled, isUploading, handleUpload]
  )

  const handleClear = () => {
    onChange(null)
    setError(null)
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  // If there's an image URL, show the preview
  if (value) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          <div className="relative aspect-video w-full">
            <Image
              src={value}
              alt="Uploaded image"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 400px"
              unoptimized
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBrowseClick}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="sr-only"
        />
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Drag and drop zone */}
      <div
        role="button"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-label="Upload image. Drop an image here or click to browse."
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors',
          isDragging && 'border-primary bg-primary/5',
          !isDragging && 'border-muted-foreground/25 hover:border-muted-foreground/50',
          (disabled || isUploading) && 'opacity-50 cursor-not-allowed',
          !disabled && !isUploading && 'cursor-pointer'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!disabled && !isUploading ? handleBrowseClick : undefined}
        onKeyDown={(e) => {
          if (!disabled && !isUploading && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            handleBrowseClick()
          }
        }}
      >
        <div className="flex flex-col items-center justify-center py-8 px-4">
          {isUploading ? (
            <>
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              {isDragging ? (
                <Upload className="h-10 w-10 text-primary mb-3" />
              ) : (
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
              )}
              <p className="text-sm text-muted-foreground text-center mb-1">
                {isDragging ? 'Drop image here' : 'Drag and drop an image, or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP, GIF, or HEIC up to 10MB
              </p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="sr-only"
        />
      </div>

      {/* Alt text input */}
      <div className="space-y-1.5">
        <Label htmlFor="alt-text" className="text-xs">
          Alt text (optional)
        </Label>
        <Input
          id="alt-text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          placeholder="Describe the image for accessibility"
          disabled={disabled || isUploading}
          className="text-sm"
        />
      </div>
    </div>
  )
}
