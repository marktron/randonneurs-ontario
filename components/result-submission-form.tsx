'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  submitRiderResult,
  uploadResultFile,
  deleteResultFile,
  type ResultSubmissionData,
} from '@/lib/actions/rider-results'
import { Upload, X, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react'

interface ResultSubmissionFormProps {
  token: string
  initialData: ResultSubmissionData
}

type FileUploadState = {
  uploading: boolean
  path: string | null
  url: string | null
  error: string | null
}

export function ResultSubmissionForm({ token, initialData }: ResultSubmissionFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [status, setStatus] = useState<string>(
    initialData.currentStatus === 'pending' ? '' : initialData.currentStatus
  )
  const [finishTime, setFinishTime] = useState(initialData.finishTime || '')
  const [gpxUrl, setGpxUrl] = useState(initialData.gpxUrl || '')
  const [riderNotes, setRiderNotes] = useState(initialData.riderNotes || '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // File upload state
  const [gpxFile, setGpxFile] = useState<FileUploadState>({
    uploading: false,
    path: initialData.gpxFilePath,
    url: initialData.gpxFilePath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${initialData.gpxFilePath}`
      : null,
    error: null,
  })
  const [controlCardFront, setControlCardFront] = useState<FileUploadState>({
    uploading: false,
    path: initialData.controlCardFrontPath,
    url: initialData.controlCardFrontPath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${initialData.controlCardFrontPath}`
      : null,
    error: null,
  })
  const [controlCardBack, setControlCardBack] = useState<FileUploadState>({
    uploading: false,
    path: initialData.controlCardBackPath,
    url: initialData.controlCardBackPath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rider-submissions/${initialData.controlCardBackPath}`
      : null,
    error: null,
  })

  // File input refs
  const gpxInputRef = useRef<HTMLInputElement>(null)
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(
    file: File,
    fileType: 'gpx' | 'control_card_front' | 'control_card_back',
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>
  ) {
    setState(prev => ({ ...prev, uploading: true, error: null }))

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadResultFile(token, fileType, formData)

    if (result.success && result.data) {
      setState({
        uploading: false,
        path: result.data.path,
        url: result.data.url,
        error: null,
      })
    } else {
      setState(prev => ({
        ...prev,
        uploading: false,
        error: result.error || 'Upload failed',
      }))
    }
  }

  async function handleFileDelete(
    fileType: 'gpx' | 'control_card_front' | 'control_card_back',
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    setState(prev => ({ ...prev, uploading: true, error: null }))

    const result = await deleteResultFile(token, fileType)

    if (result.success) {
      setState({ uploading: false, path: null, url: null, error: null })
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } else {
      setState(prev => ({
        ...prev,
        uploading: false,
        error: result.error || 'Delete failed',
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!status) {
      setError('Please select your finish status')
      return
    }

    startTransition(async () => {
      const result = await submitRiderResult({
        token,
        status: status as 'finished' | 'dnf' | 'dns',
        finishTime: status === 'finished' ? finishTime : null,
        gpxUrl: gpxUrl || null,
        riderNotes: riderNotes || null,
      })

      if (result.success) {
        setSuccess(true)
        router.refresh()
      } else {
        setError(result.error || 'Submission failed')
      }
    })
  }

  if (!initialData.canSubmit) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
            <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl tracking-tight mb-2">Results Already Submitted</h2>
          <p className="text-sm text-muted-foreground">
            The results for this event have already been submitted to ACP.
            <br />
            Contact your chapter VP if you need to make changes.
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl tracking-tight mb-2">Result Submitted!</h2>
          <p className="text-sm text-muted-foreground">
            Thank you for submitting your result.
            <br />
            Your chapter VP will review and submit to ACP.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <h2 className="font-serif text-2xl tracking-tight mb-6">Submit Your Result</h2>

      {initialData.submittedAt && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-sm">
          <p className="text-muted-foreground">
            You previously submitted your result. You can update it below.
          </p>
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status">Finish Status *</Label>
          <Select value={status} onValueChange={setStatus} disabled={isPending}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder="Select your finish status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="dnf">Did Not Finish (DNF)</SelectItem>
              <SelectItem value="dns">Did Not Start (DNS)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Finish Time - only show if finished */}
        {status === 'finished' && (
          <div className="space-y-2">
            <Label htmlFor="finishTime">Elapsed Time *</Label>
            <Input
              id="finishTime"
              type="text"
              placeholder="HH:MM (e.g., 13:30 or 105:45)"
              value={finishTime}
              onChange={(e) => setFinishTime(e.target.value)}
              disabled={isPending}
              pattern="\d{1,3}:\d{2}"
              required={status === 'finished'}
            />
            <p className="text-xs text-muted-foreground">
              Total elapsed time from start to finish (hours:minutes)
            </p>
          </div>
        )}

        {/* GPX / Strava URL */}
        <div className="space-y-2">
          <Label htmlFor="gpxUrl">
            Strava or GPS Activity Link
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <Input
            id="gpxUrl"
            type="url"
            placeholder="https://www.strava.com/activities/..."
            value={gpxUrl}
            onChange={(e) => setGpxUrl(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* GPX File Upload */}
        <div className="space-y-2">
          <Label>
            GPX File Upload
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <FileUploadField
            inputRef={gpxInputRef}
            state={gpxFile}
            accept=".gpx,.xml"
            icon={<FileText className="h-4 w-4" />}
            label="Upload GPX file"
            disabled={isPending}
            onUpload={(file) => handleFileUpload(file, 'gpx', setGpxFile)}
            onDelete={() => handleFileDelete('gpx', setGpxFile, gpxInputRef)}
          />
        </div>

        {/* Control Card Photos */}
        <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-4">
          <p className="text-sm font-medium">Control Card Photos</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Front of Card</Label>
              <FileUploadField
                inputRef={frontInputRef}
                state={controlCardFront}
                accept="image/jpeg,image/png,image/webp"
                icon={<ImageIcon className="h-4 w-4" />}
                label="Upload front"
                disabled={isPending}
                onUpload={(file) => handleFileUpload(file, 'control_card_front', setControlCardFront)}
                onDelete={() => handleFileDelete('control_card_front', setControlCardFront, frontInputRef)}
              />
            </div>

            <div className="space-y-2">
              <Label>Back of Card</Label>
              <FileUploadField
                inputRef={backInputRef}
                state={controlCardBack}
                accept="image/jpeg,image/png,image/webp"
                icon={<ImageIcon className="h-4 w-4" />}
                label="Upload back"
                disabled={isPending}
                onUpload={(file) => handleFileUpload(file, 'control_card_back', setControlCardBack)}
                onDelete={() => handleFileDelete('control_card_back', setControlCardBack, backInputRef)}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="riderNotes">
            Notes for Organizer
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <Textarea
            id="riderNotes"
            placeholder="Any notes about your ride..."
            rows={3}
            value={riderNotes}
            onChange={(e) => setRiderNotes(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? 'Submitting...' : 'Submit Result'}
        </Button>
      </form>
    </div>
  )
}

interface FileUploadFieldProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  state: FileUploadState
  accept: string
  icon: React.ReactNode
  label: string
  disabled: boolean
  onUpload: (file: File) => void
  onDelete: () => void
}

function FileUploadField({
  inputRef,
  state,
  accept,
  icon,
  label,
  disabled,
  onUpload,
  onDelete,
}: FileUploadFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
    }
  }

  if (state.path && state.url) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background">
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center gap-2 text-sm text-primary hover:underline truncate"
        >
          {icon}
          <span className="truncate">{state.path.split('/').pop()}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={disabled || state.uploading}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove</span>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled || state.uploading}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || state.uploading}
      >
        {state.uploading ? (
          <>
            <span className="animate-spin mr-2">...</span>
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            {label}
          </>
        )}
      </Button>
      {state.error && (
        <p className="text-xs text-destructive mt-1">{state.error}</p>
      )}
    </div>
  )
}
