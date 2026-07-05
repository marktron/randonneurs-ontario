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
  createResultUploadUrl,
  confirmResultUpload,
  deleteResultFile,
  getRiderUpcomingEvents,
  getChapterUpcomingEvents,
  type ResultSubmissionData,
  type UpcomingEvent,
} from '@/lib/actions/rider-results'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { compressImageForUpload } from '@/lib/image-compression'
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Clock,
  ArrowRight,
  Route,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import {
  calculateElapsedMinutes,
  formatElapsedForDisplay,
  formatElapsedForSubmission,
  getAcpTimeLimitMinutes,
  getFinishDayOptions,
} from '@/lib/events/finish-time'

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
    initialData.currentStatus === 'pending' ? 'finished' : initialData.currentStatus
  )
  const dayOptions = getFinishDayOptions(
    initialData.eventDate,
    initialData.eventStartTime,
    initialData.eventDistance
  )
  const useClockTimeInput = dayOptions.length > 0 && initialData.eventStartTime !== null
  const initialFinish = decodeInitialFinish(
    initialData.finishTime,
    initialData.eventStartTime,
    dayOptions.length
  )
  // Clock-time + day mode (used when we know the event's start time)
  const [finishClockTime, setFinishClockTime] = useState(initialFinish.clockTime)
  const [finishDayOffset, setFinishDayOffset] = useState(initialFinish.dayOffset)
  // Elapsed fallback (used when start_time is missing on the event)
  const [finishHours, setFinishHours] = useState(initialFinish.elapsedHours)
  const [finishMinutes, setFinishMinutes] = useState(initialFinish.elapsedMinutes)
  const [gpxUrl, setGpxUrl] = useState(initialData.gpxUrl || '')
  const [riderNotes, setRiderNotes] = useState(initialData.riderNotes || '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [suggestedEvents, setSuggestedEvents] = useState<UpcomingEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

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
    setState((prev) => ({ ...prev, uploading: true, error: null }))

    // 0. Compress images in the browser before upload (HEIC → JPEG, resize)
    let uploadFile: File
    try {
      uploadFile = await compressImageForUpload(file)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      }))
      return
    }

    // Browsers (especially Safari/macOS) don't always recognize the GPX MIME
    // type and report file.type as "" or "application/octet-stream" for .gpx
    // files, which would fail both our server validation and Supabase Storage's
    // bucket allowlist. Since the form already knows this is a GPX upload,
    // bake the canonical MIME type into a new File object — supabase-js's
    // uploadToSignedUrl wraps Blob bodies in FormData and uses the File's
    // intrinsic .type as the multipart Content-Type, ignoring any contentType
    // option we pass.
    let fileToUpload = uploadFile
    if (fileType === 'gpx' && uploadFile.type !== 'application/gpx+xml') {
      fileToUpload = new File([uploadFile], uploadFile.name, {
        type: 'application/gpx+xml',
        lastModified: uploadFile.lastModified,
      })
    }

    // 1. Ask the server for a signed upload URL (avoids the server-action body limit)
    const signed = await createResultUploadUrl({
      token,
      fileType,
      fileName: fileToUpload.name,
      contentType: fileToUpload.type,
      fileSize: fileToUpload.size,
    })

    if (!signed.success || !signed.data) {
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: signed.error || 'Upload failed',
      }))
      return
    }

    // 2. Upload directly to Supabase Storage using the signed URL
    const supabase = createSupabaseBrowserClient()
    const { error: uploadError } = await supabase.storage
      .from('rider-submissions')
      .uploadToSignedUrl(signed.data.path, signed.data.uploadToken, fileToUpload, {
        upsert: false,
      })

    if (uploadError) {
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: uploadError.message || 'Upload failed',
      }))
      return
    }

    // 3. Tell the server the upload finished so it persists the path
    const confirmed = await confirmResultUpload({
      token,
      fileType,
      path: signed.data.path,
    })

    if (!confirmed.success || !confirmed.data) {
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: confirmed.error || 'Upload failed',
      }))
      return
    }

    setState({
      uploading: false,
      path: confirmed.data.path,
      url: confirmed.data.url,
      error: null,
    })
  }

  async function handleFileDelete(
    fileType: 'gpx' | 'control_card_front' | 'control_card_back',
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    setState((prev) => ({ ...prev, uploading: true, error: null }))

    const result = await deleteResultFile(token, fileType)

    if (result.success) {
      setState({ uploading: false, path: null, url: null, error: null })
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } else {
      setState((prev) => ({
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

    let finishTime: string | null = null
    if (status === 'finished') {
      if (useClockTimeInput && initialData.eventStartTime) {
        const elapsed = calculateElapsedMinutes(
          initialData.eventStartTime,
          finishClockTime,
          finishDayOffset
        )
        if (elapsed === null) {
          setError('Finish time must be after the event start time.')
          return
        }
        finishTime = formatElapsedForSubmission(elapsed)
      } else if (finishHours && finishMinutes) {
        finishTime = `${finishHours}:${finishMinutes.padStart(2, '0')}`
      }
    }

    startTransition(async () => {
      const submission = await submitRiderResult({
        token,
        status: status as 'finished' | 'dnf' | 'dns',
        finishTime,
        gpxUrl: gpxUrl || null,
        riderNotes: riderNotes || null,
      })

      if (submission.success) {
        setSuccess(true)
        router.refresh()

        // Fetch upcoming events for the rider
        setLoadingEvents(true)
        try {
          const upcomingResult = await getRiderUpcomingEvents(initialData.riderId)
          if (upcomingResult.success && upcomingResult.data && upcomingResult.data.length > 0) {
            setUpcomingEvents(upcomingResult.data)
          } else if (initialData.chapterSlug) {
            // No upcoming events - fetch suggested events from the same chapter
            const suggestedResult = await getChapterUpcomingEvents(
              initialData.chapterSlug,
              initialData.riderId,
              3
            )
            if (suggestedResult.success && suggestedResult.data) {
              setSuggestedEvents(suggestedResult.data)
            }
          }
        } catch {
          // Silently fail - the events are a nice-to-have
        } finally {
          setLoadingEvents(false)
        }
      } else {
        setError(submission.error || 'Submission failed')
      }
    })
  }

  if (!initialData.canSubmit) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
            <svg
              className="w-6 h-6 text-amber-600 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
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
            <svg
              className="w-6 h-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="font-serif text-2xl tracking-tight mb-2">Result Submitted!</h2>
          <p className="text-sm text-muted-foreground">
            Thank you for submitting your result.
            <br />
            Your chapter VP will review and submit to ACP.
          </p>
        </div>

        {/* Upcoming Events Section */}
        {loadingEvents && (
          <div className="border-t border-border pt-6 mt-6">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Loading upcoming events…
            </div>
          </div>
        )}

        {!loadingEvents && upcomingEvents.length > 0 && (
          <div className="border-t border-border pt-6 mt-6">
            <h3 className="font-medium text-sm mb-4 text-center">Your Upcoming Events</h3>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <UpcomingEventCard key={event.id} event={event} isRegistered={true} />
              ))}
            </div>
          </div>
        )}

        {!loadingEvents && upcomingEvents.length === 0 && suggestedEvents.length > 0 && (
          <div className="border-t border-border pt-6 mt-6">
            <h3 className="font-medium text-sm mb-1 text-center">Ready for Your Next Ride?</h3>
            <p className="text-xs text-muted-foreground mb-4 text-center">
              Here are some upcoming events in {initialData.chapterName}
            </p>
            <div className="space-y-3">
              {suggestedEvents.map((event) => (
                <UpcomingEventCard key={event.id} event={event} isRegistered={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const eventDate = format(new Date(initialData.eventDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')
  const needsTrack =
    initialData.currentStatus === 'finished' && !initialData.gpxUrl && !initialData.gpxFilePath

  return (
    <div className="md:rounded-2xl md:border md:border-border md:bg-card md:p-8">
      {/* Event Header */}
      <header className="mb-8 pb-6 border-b border-border text-center">
        <p className="text-base md:text-lg mb-1">
          Result for <span className="font-medium">{initialData.riderName}</span>
        </p>
        <h1 className="font-serif text-2xl md:text-3xl tracking-tight mb-2">
          {initialData.eventName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {eventDate} · {initialData.eventDistance} km · {initialData.chapterName}
        </p>
      </header>

      {needsTrack ? (
        <div className="flex items-start gap-3 mb-6 pb-6 border-b border-border">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Route className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Almost done — add your ride track</p>
            <p className="text-sm text-muted-foreground">
              Your finish is recorded. Add your Strava link or GPX file below to complete your
              submission.
            </p>
          </div>
        </div>
      ) : initialData.submittedAt ? (
        <div className="flex items-start gap-3 mb-6 pb-6 border-b border-border">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Previously Submitted</p>
            <p className="text-sm text-muted-foreground">
              You can update your submission below if needed.
            </p>
          </div>
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status">Finish Status</Label>
          <Select value={status} onValueChange={setStatus} disabled={isPending}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder="Select your finish status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="dnf">Did Not Finish (DNF)</SelectItem>
              <SelectItem value="dns">Did Not Start (DNS)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Finish Time - only show if finished */}
        {status === 'finished' && useClockTimeInput && initialData.eventStartTime && (
          <FinishClockTimeFields
            startTime={initialData.eventStartTime}
            distanceKm={initialData.eventDistance}
            dayOptions={dayOptions}
            clockTime={finishClockTime}
            onClockTimeChange={setFinishClockTime}
            dayOffset={finishDayOffset}
            onDayOffsetChange={setFinishDayOffset}
            disabled={isPending}
          />
        )}

        {status === 'finished' && !useClockTimeInput && (
          <div className="space-y-2">
            <Label>Elapsed Time</Label>
            <p className="text-xs text-muted-foreground">
              This event doesn’t have a recorded start time, so please enter how long your ride took
              (start to finish control).
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  id="finishHours"
                  type="number"
                  min="0"
                  max="999"
                  placeholder="0"
                  value={finishHours}
                  onChange={(e) => setFinishHours(e.target.value)}
                  disabled={isPending}
                  required={status === 'finished'}
                  className="text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground text-center mt-1">hours</p>
              </div>
              <span className="text-xl text-muted-foreground font-medium pb-5">:</span>
              <div className="flex-1">
                <Input
                  id="finishMinutes"
                  type="number"
                  min="0"
                  max="59"
                  placeholder="00"
                  value={finishMinutes}
                  onChange={(e) => setFinishMinutes(e.target.value)}
                  disabled={isPending}
                  required={status === 'finished'}
                  className="text-center tabular-nums"
                />
                <p className="text-xs text-muted-foreground text-center mt-1">minutes</p>
              </div>
            </div>
          </div>
        )}

        {/* Ride Evidence Section - only show if finished */}
        {status === 'finished' && (
          <div className="space-y-2">
            <Label htmlFor="gpxUrl">Strava or GPS Activity Link</Label>
            <Input
              id="gpxUrl"
              type="url"
              placeholder="https://www.strava.com/activities/…"
              value={gpxUrl}
              onChange={(e) => setGpxUrl(e.target.value)}
              disabled={isPending}
            />
            {/* GPX file upload - inline link style */}
            <input
              ref={gpxInputRef}
              type="file"
              accept=".gpx,.xml"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file, 'gpx', setGpxFile)
              }}
              disabled={isPending || gpxFile.uploading}
              className="hidden"
            />
            {gpxFile.path && gpxFile.url ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={gpxFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {gpxFile.path.split('/').pop()}
                </a>
                <button
                  type="button"
                  onClick={() => handleFileDelete('gpx', setGpxFile, gpxInputRef)}
                  disabled={isPending || gpxFile.uploading}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {gpxFile.uploading ? (
                  'Uploading…'
                ) : (
                  <>
                    or{' '}
                    <button
                      type="button"
                      onClick={() => gpxInputRef.current?.click()}
                      disabled={isPending}
                      className="text-primary hover:underline"
                    >
                      upload a GPX file
                    </button>
                  </>
                )}
              </p>
            )}
            {gpxFile.error && (
              <p role="alert" className="text-xs text-destructive">
                {gpxFile.error}
              </p>
            )}
          </div>
        )}

        {/* Control Card Photos - only show if finished and not a populaire */}
        {status === 'finished' && initialData.eventType !== 'populaire' && (
          <fieldset
            className="bg-muted/50 border border-border rounded-lg p-4 space-y-4"
            disabled={isPending}
          >
            <legend className="text-sm font-medium px-1">Control Card Photos</legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Front of Card</Label>
                <FileUploadField
                  inputRef={frontInputRef}
                  state={controlCardFront}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="Upload front"
                  disabled={isPending}
                  onUpload={(file) =>
                    handleFileUpload(file, 'control_card_front', setControlCardFront)
                  }
                  onDelete={() =>
                    handleFileDelete('control_card_front', setControlCardFront, frontInputRef)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Back of Card</Label>
                <FileUploadField
                  inputRef={backInputRef}
                  state={controlCardBack}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="Upload back"
                  disabled={isPending}
                  onUpload={(file) =>
                    handleFileUpload(file, 'control_card_back', setControlCardBack)
                  }
                  onDelete={() =>
                    handleFileDelete('control_card_back', setControlCardBack, backInputRef)
                  }
                />
              </div>
            </div>
          </fieldset>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="riderNotes">Feedback for Ride Organizers (optional)</Label>
          <Textarea
            id="riderNotes"
            placeholder="Any notes about your ride (e.g. route conditions, suggestions, etc.)"
            rows={3}
            value={riderNotes}
            onChange={(e) => setRiderNotes(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? 'Saving…' : 'Submit Your Result'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Results are not official until reviewed by the Ride Organizer.
        </p>
      </form>
    </div>
  )
}

interface FinishClockTimeFieldsProps {
  startTime: string
  distanceKm: number
  dayOptions: ReturnType<typeof getFinishDayOptions>
  clockTime: string
  onClockTimeChange: (value: string) => void
  dayOffset: number
  onDayOffsetChange: (value: number) => void
  disabled: boolean
}

function FinishClockTimeFields({
  startTime,
  distanceKm,
  dayOptions,
  clockTime,
  onClockTimeChange,
  dayOffset,
  onDayOffsetChange,
  disabled,
}: FinishClockTimeFieldsProps) {
  const elapsedMinutes = clockTime ? calculateElapsedMinutes(startTime, clockTime, dayOffset) : null
  const limitMinutes = getAcpTimeLimitMinutes(distanceKm)
  const isOverLimit = elapsedMinutes !== null && elapsedMinutes > limitMinutes
  const showDaySelector = dayOptions.length > 1

  return (
    <div className="space-y-2">
      <Label htmlFor="finishClockTime">Finish Time</Label>
      <p className="text-xs text-muted-foreground">
        Enter the time of your last control card stamp at the finish.
      </p>
      {showDaySelector && (
        <div
          role="radiogroup"
          aria-label="Finish day"
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        >
          {dayOptions.map((opt) => {
            const selected = opt.offset === dayOffset
            return (
              <button
                key={opt.offset}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onDayOffsetChange(opt.offset)}
                className={
                  'rounded-md border px-3 py-2 text-sm transition-colors ' +
                  (selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted')
                }
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
      <Input
        id="finishClockTime"
        type="time"
        value={clockTime}
        onChange={(e) => onClockTimeChange(e.target.value)}
        disabled={disabled}
        required
        className="tabular-nums"
      />
      {elapsedMinutes !== null && (
        <p
          className={
            'text-xs ' +
            (isOverLimit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')
          }
        >
          Elapsed: {formatElapsedForDisplay(elapsedMinutes)}
          {isOverLimit && (
            <>
              {' '}
              · past the ACP cutoff of {formatElapsedForDisplay(limitMinutes)}. Your chapter VP will
              follow up about how to record this ride.
            </>
          )}
        </p>
      )}
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
            <span className="animate-spin mr-2">…</span>
            Uploading…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            {label}
          </>
        )}
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-destructive mt-1">
          {state.error}
        </p>
      )}
    </div>
  )
}

interface UpcomingEventCardProps {
  event: UpcomingEvent
  isRegistered: boolean
}

interface DecodedInitialFinish {
  clockTime: string
  dayOffset: number
  elapsedHours: string
  elapsedMinutes: string
}

function decodeInitialFinish(
  finishTime: string | null,
  startTime: string | null,
  dayOptionCount: number
): DecodedInitialFinish {
  if (!finishTime) {
    return { clockTime: '', dayOffset: 0, elapsedHours: '', elapsedMinutes: '' }
  }
  const [rawHours, rawMinutes] = finishTime.split(':')
  const elapsedHours = rawHours || ''
  const elapsedMinutes = rawMinutes || ''

  if (!startTime) {
    return { clockTime: '', dayOffset: 0, elapsedHours, elapsedMinutes }
  }
  const [sh, sm] = startTime.split(':').map(Number)
  const eh = parseInt(rawHours || '0', 10)
  const em = parseInt(rawMinutes || '0', 10)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) {
    return { clockTime: '', dayOffset: 0, elapsedHours, elapsedMinutes }
  }
  const totalFinishMin = sh * 60 + sm + eh * 60 + em
  const dayOffset = Math.min(
    Math.max(0, dayOptionCount - 1),
    Math.floor(totalFinishMin / (24 * 60))
  )
  const minOnDay = totalFinishMin - dayOffset * 24 * 60
  const ch = Math.floor(minOnDay / 60)
  const cm = minOnDay % 60
  const clockTime = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`
  return { clockTime, dayOffset, elapsedHours, elapsedMinutes }
}

function UpcomingEventCard({ event, isRegistered }: UpcomingEventCardProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex-shrink-0 text-center w-14">
        <div className="text-xs text-muted-foreground uppercase">
          {format(new Date(event.date + 'T00:00:00'), 'MMM')}
        </div>
        <div className="text-lg font-medium tabular-nums">
          {format(new Date(event.date + 'T00:00:00'), 'd')}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{event.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{event.distance} km</div>
        {event.startLocation && (
          <div className="text-xs text-muted-foreground truncate">{event.startLocation}</div>
        )}
      </div>
      <Link
        href={`/register/${event.slug}`}
        className="flex-shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {isRegistered ? 'Details' : 'Register'}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
