'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Upload, X, ExternalLink, AlertCircle, FileText } from 'lucide-react'
import { createImageUploadUrl, confirmImageUpload } from '@/lib/actions/images'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'

interface CueSheetFieldProps {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function CueSheetField({ value, onChange, disabled = false }: CueSheetFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size: 10MB')
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      const signed = await createImageUploadUrl({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        folder: 'cue-sheets',
      })

      if (!signed.success || !signed.data) {
        setError(signed.error || 'Failed to create upload URL')
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from('images')
        .uploadToSignedUrl(signed.data.storagePath, signed.data.uploadToken, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        setError(uploadError.message || 'Failed to upload file')
        return
      }

      const confirmed = await confirmImageUpload({
        storagePath: signed.data.storagePath,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      })

      if (!confirmed.success || !confirmed.data) {
        setError(confirmed.error || 'Failed to confirm upload')
        return
      }

      onChange(confirmed.data.url)
      toast.success('Cue sheet uploaded')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    e.target.value = ''
  }

  const handleClear = () => {
    onChange('')
    setError(null)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="cueSheet">Cue Sheet</Label>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
          >
            {value}
          </a>
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label="View cue sheet"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Remove cue sheet"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            id="cueSheet"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com/cuesheet.pdf"
            disabled={disabled || isUploading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="shrink-0"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isUploading ? 'Uploading…' : 'Upload PDF'}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        className="sr-only"
      />

      {!value && (
        <p className="text-xs text-muted-foreground">
          Upload a PDF or paste a URL to an external cue sheet.
        </p>
      )}
    </div>
  )
}
