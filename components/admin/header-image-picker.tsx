'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createImageUploadUrl, confirmImageUpload } from '@/lib/actions/images'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { compressImageForUpload } from '@/lib/image-compression'
import { toast } from 'sonner'
import { ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface HeaderImagePickerProps {
  value?: string
  onChange: (value: string | undefined) => void
}

export function HeaderImagePicker({ value, onChange }: HeaderImagePickerProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback(
    async (file: File) => {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Use PNG, JPEG, WebP, or GIF.')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 10MB.')
        return
      }

      setIsUploading(true)

      try {
        // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
        let uploadFile: File
        try {
          uploadFile = await compressImageForUpload(file)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to upload image')
          return
        }

        // 1. Mint a signed upload URL
        const signed = await createImageUploadUrl({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          folder: 'headers',
        })

        if (!signed.success || !signed.data) {
          toast.error(signed.error || 'Failed to upload image')
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
          toast.error(uploadError.message || 'Failed to upload image')
          return
        }

        // 3. Persist metadata
        const confirmed = await confirmImageUpload({
          storagePath: signed.data.storagePath,
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
          altText: null,
        })

        if (!confirmed.success || !confirmed.data) {
          toast.error(confirmed.error || 'Failed to upload image')
          return
        }

        onChange(confirmed.data.url)
        toast.success('Header image uploaded')
      } catch {
        toast.error('Failed to upload image')
      } finally {
        setIsUploading(false)
      }
    },
    [onChange]
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
      const imageFile = files.find((f) => f.type.startsWith('image/'))

      if (imageFile) {
        handleImageUpload(imageFile)
      }
    },
    [handleImageUpload]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleImageUpload(file)
      }
      // Reset input so the same file can be selected again
      e.target.value = ''
    },
    [handleImageUpload]
  )

  const handleRemove = useCallback(() => {
    onChange(undefined)
  }, [onChange])

  return (
    <div className="space-y-2">
      <Label>Header Image</Label>
      <p className="text-xs text-muted-foreground">
        Optional. If no image is set, a simple text header will be used. Recommended size: 1920 x
        640 pixels (3:1 ratio) for best results on desktop and mobile.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelect}
      />

      {value ? (
        <div className="relative rounded-lg border overflow-hidden max-w-2xl w-full">
          <div className="relative aspect-[3/1] bg-muted w-full">
            <Image src={value} alt="Header preview" fill className="object-cover" />
          </div>
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Replace
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload header image. Drop an image here or click to browse."
          className={cn(
            'relative rounded-lg border-2 border-dashed py-12 px-8 transition-colors cursor-pointer max-w-2xl',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50',
            isUploading && 'pointer-events-none opacity-50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
        >
          <div className="flex flex-col items-center justify-center text-center">
            {isUploading ? (
              <>
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </>
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop an image here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPEG, WebP, or GIF up to 10MB
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
