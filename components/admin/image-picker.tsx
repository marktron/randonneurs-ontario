'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageIcon, Upload, Check, X, Loader2 } from 'lucide-react'
import { getImages, uploadImage, type ImageMetadata } from '@/lib/actions/images'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ImagePickerProps {
  /** Current image URL */
  value?: string | null
  /** Callback when image is selected or cleared */
  onChange: (url: string | null) => void
  /** Folder to upload new images to */
  folder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Label for the field */
  label?: string
  /** Additional description */
  description?: string
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function ImagePicker({
  value,
  onChange,
  folder = 'general',
  disabled = false,
  label = 'Image',
  description,
}: ImagePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [images, setImages] = useState<ImageMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Load images when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadImages()
    }
  }, [isOpen])

  // Reset selected URL when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedUrl(value || null)
    }
  }, [isOpen, value])

  const loadImages = async () => {
    setIsLoading(true)
    try {
      const loadedImages = await getImages()
      setImages(loadedImages)
    } catch (error) {
      console.error('Failed to load images:', error)
      toast.error('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Invalid file type. Use JPEG, PNG, WebP, or GIF.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File too large. Maximum size is 5MB.')
      return
    }

    setUploadError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      if (altText) {
        formData.append('altText', altText)
      }

      const result = await uploadImage(formData)

      if (result.success && result.data) {
        // Add to the images list and select it
        await loadImages()
        setSelectedUrl(result.data.url)
        setAltText('')
        toast.success('Image uploaded')
      } else {
        setUploadError(result.error || 'Failed to upload')
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError('An unexpected error occurred')
    } finally {
      setIsUploading(false)
      // Reset the input
      e.target.value = ''
    }
  }

  const handleConfirm = () => {
    onChange(selectedUrl)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Current image preview */}
      {value ? (
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          <div className="relative aspect-video w-full max-w-xs">
            <Image
              src={value}
              alt="Selected image"
              fill
              className="object-cover"
              sizes="320px"
            />
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                >
                  Change
                </Button>
              </DialogTrigger>
              <ImagePickerDialog
                images={images}
                isLoading={isLoading}
                isUploading={isUploading}
                selectedUrl={selectedUrl}
                setSelectedUrl={setSelectedUrl}
                altText={altText}
                setAltText={setAltText}
                uploadError={uploadError}
                onFileSelect={handleFileSelect}
                onConfirm={handleConfirm}
              />
            </Dialog>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              onClick={handleClear}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        </div>
      ) : (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-muted-foreground"
              disabled={disabled}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Select image...
            </Button>
          </DialogTrigger>
          <ImagePickerDialog
            images={images}
            isLoading={isLoading}
            isUploading={isUploading}
            selectedUrl={selectedUrl}
            setSelectedUrl={setSelectedUrl}
            altText={altText}
            setAltText={setAltText}
            uploadError={uploadError}
            onFileSelect={handleFileSelect}
            onConfirm={handleConfirm}
          />
        </Dialog>
      )}
    </div>
  )
}

// Separate component for the dialog content to keep things organized
interface ImagePickerDialogProps {
  images: ImageMetadata[]
  isLoading: boolean
  isUploading: boolean
  selectedUrl: string | null
  setSelectedUrl: (url: string | null) => void
  altText: string
  setAltText: (text: string) => void
  uploadError: string | null
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onConfirm: () => void
}

function ImagePickerDialog({
  images,
  isLoading,
  isUploading,
  selectedUrl,
  setSelectedUrl,
  altText,
  setAltText,
  uploadError,
  onFileSelect,
  onConfirm,
}: ImagePickerDialogProps) {
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Select Image</DialogTitle>
        <DialogDescription>
          Choose an existing image or upload a new one.
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">Image Library</TabsTrigger>
          <TabsTrigger value="upload">Upload New</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-md" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No images uploaded yet.</p>
              <p className="text-sm">Upload your first image to get started.</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-3 gap-2 pr-4">
                {images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedUrl(image.url)}
                    className={cn(
                      'relative aspect-video rounded-md overflow-hidden border-2 transition-all',
                      selectedUrl === image.url
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                  >
                    <Image
                      src={image.url}
                      alt={image.altText || image.filename}
                      fill
                      className="object-cover"
                      sizes="200px"
                    />
                    {selectedUrl === image.url && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary rounded-full p-1">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <p className="text-[10px] text-white truncate">
                        {image.filename}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="upload" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="alt-text">Alt text (optional)</Label>
            <Input
              id="alt-text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image for accessibility"
              disabled={isUploading}
            />
          </div>

          <div className="relative">
            <label
              className={cn(
                'flex flex-col items-center justify-center py-8 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                isUploading
                  ? 'border-muted-foreground/25 cursor-not-allowed'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground text-center mb-1">
                    Click to select an image
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, or GIF up to 5MB
                  </p>
                </>
              )}
              <input
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                onChange={onFileSelect}
                disabled={isUploading}
                className="sr-only"
              />
            </label>
          </div>

          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!selectedUrl}
        >
          Select Image
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
