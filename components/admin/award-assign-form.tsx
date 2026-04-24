'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  assignResultAward,
  assignSeasonAward,
  searchRiderResults,
  type RiderResultOption,
} from '@/lib/actions/awards'
import { searchRiders, type RiderSearchResult } from '@/lib/actions/riders'

export interface AwardOption {
  id: string
  slug: string
  title: string
  award_type: 'result' | 'season'
  description: string | null
}

interface Props {
  awards: AwardOption[]
}

export function AwardAssignForm({ awards }: Props) {
  const [awardId, setAwardId] = useState('')
  const [riderQuery, setRiderQuery] = useState('')
  const [riderResults, setRiderResults] = useState<RiderSearchResult[]>([])
  const [isSearchingRiders, setIsSearchingRiders] = useState(false)
  const [selectedRider, setSelectedRider] = useState<RiderSearchResult | null>(null)

  const [riderResultOptions, setRiderResultOptions] = useState<RiderResultOption[]>([])
  const [resultId, setResultId] = useState('')

  const [season, setSeason] = useState<number>(new Date().getFullYear())
  const [note, setNote] = useState('')

  const [isPending, startTransition] = useTransition()

  const award = useMemo(() => awards.find((a) => a.id === awardId) ?? null, [awards, awardId])

  // Debounced rider search
  useEffect(() => {
    if (!award) return
    if (selectedRider) return
    if (riderQuery.length < 2) {
      setRiderResults([])
      return
    }
    const t = setTimeout(async () => {
      setIsSearchingRiders(true)
      const found = await searchRiders(riderQuery)
      setRiderResults(found)
      setIsSearchingRiders(false)
    }, 300)
    return () => clearTimeout(t)
  }, [riderQuery, selectedRider, award])

  // When a rider is picked for a result-scoped award, fetch their results.
  useEffect(() => {
    if (!award || award.award_type !== 'result' || !selectedRider) {
      setRiderResultOptions([])
      setResultId('')
      return
    }
    let cancelled = false
    ;(async () => {
      const opts = await searchRiderResults(selectedRider.id)
      if (!cancelled) setRiderResultOptions(opts)
    })()
    return () => {
      cancelled = true
    }
  }, [award, selectedRider])

  function resetExceptAward() {
    setRiderQuery('')
    setRiderResults([])
    setSelectedRider(null)
    setRiderResultOptions([])
    setResultId('')
    setNote('')
    setSeason(new Date().getFullYear())
  }

  function pickRider(r: RiderSearchResult) {
    setSelectedRider(r)
    setRiderQuery(`${r.first_name} ${r.last_name}`)
    setRiderResults([])
  }

  function handleSubmit() {
    if (!award) return

    if (award.award_type === 'result') {
      if (!resultId) {
        toast.error('Pick a result first')
        return
      }
      startTransition(async () => {
        const res = await assignResultAward({ awardId: award.id, resultId })
        if (res.success) {
          toast.success(`Assigned ${award.title}`)
          resetExceptAward()
        } else {
          toast.error(res.error || 'Failed to assign award')
        }
      })
      return
    }

    // season
    if (!selectedRider) {
      toast.error('Pick a rider first')
      return
    }
    startTransition(async () => {
      const res = await assignSeasonAward({
        awardId: award.id,
        riderId: selectedRider.id,
        season,
        note: note.trim() || null,
      })
      if (res.success) {
        toast.success(`Assigned ${award.title}`)
        resetExceptAward()
      } else {
        toast.error(res.error || 'Failed to assign award')
      }
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="award">Award</Label>
        <Select
          value={awardId}
          onValueChange={(v) => {
            setAwardId(v)
            resetExceptAward()
          }}
        >
          <SelectTrigger id="award" className="w-full">
            <SelectValue placeholder="Select an award…" />
          </SelectTrigger>
          <SelectContent>
            {awards.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title} ({a.award_type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {award && (
        <div className="space-y-2">
          <Label htmlFor="rider">Rider</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="rider"
              className="pl-8"
              placeholder="Search riders by name or email…"
              value={riderQuery}
              onChange={(e) => {
                setRiderQuery(e.target.value)
                setSelectedRider(null)
              }}
            />
          </div>
          {isSearchingRiders && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {riderResults.length > 0 && (
            <div className="rounded-md border max-h-48 overflow-y-auto">
              {riderResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRider(r)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-b-0"
                >
                  <p className="font-medium">
                    {r.first_name} {r.last_name}
                  </p>
                  {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {award && award.award_type === 'result' && selectedRider && (
        <div className="space-y-2">
          <Label htmlFor="result">Result</Label>
          <Select value={resultId} onValueChange={setResultId}>
            <SelectTrigger id="result" className="w-full">
              <SelectValue placeholder="Select a result…" />
            </SelectTrigger>
            <SelectContent>
              {riderResultOptions.map((opt) => (
                <SelectItem key={opt.resultId} value={opt.resultId}>
                  {opt.eventDate} · {opt.eventName} · {opt.distanceKm} km
                  {opt.chapterName ? ` · ${opt.chapterName}` : ''} · {opt.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {riderResultOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">This rider has no results yet.</p>
          )}
        </div>
      )}

      {award && award.award_type === 'season' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <Input
              id="season"
              type="number"
              min={1980}
              max={new Date().getFullYear() + 1}
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Earned at RM 600 in Quebec"
            />
          </div>
        </>
      )}

      {award && (
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning…
            </>
          ) : (
            'Assign'
          )}
        </Button>
      )}
    </div>
  )
}
