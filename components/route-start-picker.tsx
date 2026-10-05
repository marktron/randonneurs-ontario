'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { CircleMarker, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  canonicalStart,
  pointAtKm,
  snapToTrack,
  type RouteTrack,
  type StartPoint,
} from '@/lib/routeTrack'

interface RouteStartPickerProps {
  track: RouteTrack
  /** Chosen start, km along the route as posted; null = posted start. */
  valueKm: number | null
  onChange: (km: number | null) => void
  disabled?: boolean
}

const ROUTE_COLOR = '#dc2626' // red-600
const PIN_COLOR = '#2563eb' // blue-600

/**
 * Map of a route on which a permanent rider picks where they will start.
 * Plain Leaflet loaded inside an effect, as in components/admin/checkin-map.tsx.
 * A tap snaps to the route. Where the route passes the tapped spot more than
 * once, the rider chooses which pass. The km field does the same job for
 * keyboard users.
 */
export function RouteStartPicker({ track, valueKm, onChange, disabled }: RouteStartPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const pinRef = useRef<CircleMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [choices, setChoices] = useState<StartPoint[]>([])
  const [hint, setHint] = useState<string | null>(null)

  // The km field keeps its own text so a half-typed value ("0.", "4") is not
  // replaced by its canonical form mid-keystroke. A change from the map or the
  // pass buttons rewrites the text.
  const [kmText, setKmText] = useState(valueKm == null ? '' : String(valueKm))
  const [kmTextFor, setKmTextFor] = useState(valueKm)
  if (valueKm !== kmTextFor) {
    setKmTextFor(valueKm)
    setKmText(valueKm == null ? '' : String(valueKm))
  }

  // The map's click handler is registered once; this reads the latest props.
  const onTap = useEffectEvent((lat: number, lng: number) => {
    if (disabled) return
    const candidates = snapToTrack(track, lat, lng)
    if (candidates.length === 0) {
      setChoices([])
      setHint("That is the route's posted start.")
      onChange(null)
      return
    }
    setHint(null)
    setChoices(candidates.length > 1 ? candidates : [])
    onChange(candidates[0].offsetKm)
  })

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    ;(async () => {
      const L = await import('leaflet')
      if (cancelled || !containerRef.current) return

      const map = L.map(containerRef.current, { attributionControl: true })
      mapRef.current = map
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const line = L.polyline(
        track.points.map((p) => [p.lat, p.lng] as [number, number]),
        { color: ROUTE_COLOR, weight: 3 }
      ).addTo(map)
      const first = track.points[0]
      L.circleMarker([first.lat, first.lng], {
        radius: 6,
        color: ROUTE_COLOR,
        fillColor: '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip('Posted start')
        .addTo(map)
      map.fitBounds(line.getBounds(), { padding: [16, 16] })
      map.on('click', (e) => onTap(e.latlng.lat, e.latlng.lng))
      setReady(true)
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      pinRef.current = null
      setReady(false)
    }
  }, [track])

  // Keep the pin in step with the chosen value.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    let cancelled = false
    ;(async () => {
      const L = await import('leaflet')
      if (cancelled) return
      pinRef.current?.remove()
      pinRef.current = null
      if (valueKm == null) return
      const p = pointAtKm(track, valueKm)
      pinRef.current = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: PIN_COLOR,
        fillOpacity: 1,
      })
        .bindTooltip('Your start')
        .addTo(map)
    })()
    return () => {
      cancelled = true
    }
  }, [ready, valueKm, track])

  const maxKm = Math.round(track.totalKm * 10 - 1) / 10

  return (
    <div className="space-y-3">
      {/* isolate: Leaflet's panes use z-index 400+, which would otherwise sit
          above the form's popovers (date and route pickers). */}
      <div
        ref={containerRef}
        role="region"
        aria-label="Route map. Tap the route to choose where you will start."
        className="isolate h-64 w-full rounded-lg border border-border"
      />
      <p className="text-xs text-muted-foreground">
        Tap the route where you will start and finish. The white dot is the posted start.
      </p>

      {choices.length > 1 && (
        <div className="space-y-2" role="group" aria-label="Which pass of the route?">
          <p className="text-sm">The route passes this spot more than once. Which pass?</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.offsetKm}
                type="button"
                variant={valueKm === choice.offsetKm ? 'default' : 'outline'}
                className="h-12 sm:h-9 tabular-nums"
                disabled={disabled}
                aria-pressed={valueKm === choice.offsetKm}
                onClick={() => onChange(choice.offsetKm)}
              >
                {choice.offsetKm.toFixed(1)} km
              </Button>
            ))}
          </div>
        </div>
      )}

      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

      <div className="space-y-2">
        <Label htmlFor="start-offset-km">Or enter the distance into the posted route (km)</Label>
        <Input
          id="start-offset-km"
          type="number"
          inputMode="decimal"
          min={0.1}
          max={maxKm}
          step={0.1}
          className="tabular-nums"
          value={kmText}
          disabled={disabled}
          onChange={(e) => {
            const text = e.target.value
            const next =
              text === '' ? null : (canonicalStart(track, Number(text))?.offsetKm ?? null)
            setChoices([])
            setHint(null)
            setKmText(text)
            setKmTextFor(next)
            onChange(next)
          }}
          onBlur={() => setKmText(valueKm == null ? '' : String(valueKm))}
        />
        <p className="text-xs text-muted-foreground">
          Measured along the route as posted, even if you ride it reversed. Between 0.1 and{' '}
          {maxKm.toFixed(1)} km.
        </p>
      </div>
    </div>
  )
}
