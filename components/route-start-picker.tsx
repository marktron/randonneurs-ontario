'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { CircleMarker, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  canonicalStart,
  offeredControlPlaces,
  pointAtKm,
  snapToTrack,
  type ControlPlace,
  type RouteControl,
  type RouteTrack,
  type StartPoint,
} from '@/lib/routeTrack'

interface RouteStartPickerProps {
  track: RouteTrack
  /** Chosen start, km along the route as posted; null = posted start. */
  valueKm: number | null
  onChange: (km: number | null) => void
  /** The route's controls, as posted. Those away from the start/finish are offered as starts. */
  controls?: RouteControl[]
  /** Called with a control's name when the rider starts at that control. */
  onPickControl?: (name: string) => void
  disabled?: boolean
}

const ROUTE_COLOR = '#dc2626' // red-600
const PIN_COLOR = '#2563eb' // blue-600
const CONTROL_COLOR = '#1c1917' // stone-900, the style guide's near-black ink
const NO_CONTROLS: RouteControl[] = []

const km = (offsetKm: number) => `${offsetKm.toFixed(1)} km`

/** "Cafe, 30.0 km" or "Cafe, 30.0 km and 120.0 km". */
function describePlace(place: ControlPlace): string {
  const distances = place.passes.map((p) => km(p.offsetKm))
  const last = distances.pop()!
  return `${place.name}, ${distances.length > 0 ? `${distances.join(', ')} and ${last}` : last}`
}

/**
 * Map of a route on which a permanent rider picks where they will start.
 * Plain Leaflet loaded inside an effect, as in components/admin/checkin-map.tsx.
 * A tap snaps to the route. Where the route passes the tapped spot more than
 * once, the rider chooses which pass. The route's controls are marked and
 * start the ride exactly at the control. The control list and the km field
 * do the same jobs for keyboard users.
 */
export function RouteStartPicker({
  track,
  valueKm,
  onChange,
  controls = NO_CONTROLS,
  onPickControl,
  disabled,
}: RouteStartPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const pinRef = useRef<CircleMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [choices, setChoices] = useState<StartPoint[]>([])
  const [hint, setHint] = useState<string | null>(null)

  const places = useMemo(() => offeredControlPlaces(track, controls), [track, controls])
  // One option per pass, in route order.
  const controlOptions = useMemo(
    () =>
      places
        .flatMap((place, placeIndex) =>
          place.passes.map((start) => ({ key: `${placeIndex}:${start.offsetKm}`, place, start }))
        )
        .sort((a, b) => a.start.offsetKm - b.start.offsetKm),
    [places]
  )
  const selectedControlKey = controlOptions.find((o) => o.start.offsetKm === valueKm)?.key ?? ''

  /** Start exactly at a control: `start` is one pass of `place`. */
  function startAtControl(place: ControlPlace, start: StartPoint, offerPasses: boolean) {
    setHint(null)
    setChoices(offerPasses && place.passes.length > 1 ? place.passes : [])
    onChange(start.offsetKm)
    onPickControl?.(place.name)
  }

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

  const onControlTap = useEffectEvent((place: ControlPlace) => {
    if (disabled) return
    startAtControl(place, place.passes[0], true)
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

      // A visible dot plus a larger transparent ring that catches taps on a
      // phone. Neither passes the click on to the map, which would re-snap it.
      for (const place of places) {
        const at: [number, number] = [place.lat, place.lng]
        L.featureGroup([
          L.circleMarker(at, {
            radius: 16,
            stroke: false,
            fillOpacity: 0,
            bubblingMouseEvents: false,
            // A clicked SVG path otherwise shows the browser's focus box.
            className: 'outline-none',
          }),
          L.circleMarker(at, {
            radius: 9,
            color: '#fff',
            weight: 2,
            fillColor: CONTROL_COLOR,
            fillOpacity: 1,
            bubblingMouseEvents: false,
            className: 'outline-none',
          }),
        ])
          // Long control names wrap instead of running past the map's edge on a
          // phone. `!` because leaflet.css sets white-space after Tailwind's layer.
          .bindTooltip(describePlace(place), {
            className: 'w-max! max-w-40! whitespace-normal!',
          })
          .on('click', () => onControlTap(place))
          .addTo(map)
      }

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
  }, [track, places])

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
      // Not interactive: a tap on the pin reaches the control marker or the
      // map underneath it.
      pinRef.current = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: PIN_COLOR,
        fillOpacity: 1,
        interactive: false,
      }).addTo(map)
      pinRef.current.bringToFront()
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
        Tap the route where you will start and finish, or tap a black dot to start at that control.
        The white dot is the posted start.
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

      {controlOptions.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="start-control">Or start at a control</Label>
          <select
            id="start-control"
            value={selectedControlKey}
            disabled={disabled}
            onChange={(e) => {
              const option = controlOptions.find((o) => o.key === e.target.value)
              if (option) startAtControl(option.place, option.start, false)
            }}
            className="bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-12 sm:h-9 w-full min-w-0 rounded-4xl border px-3 text-base md:text-sm tabular-nums outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Choose a control
            </option>
            {controlOptions.map(({ key, place, start }) => (
              <option key={key} value={key}>
                {place.name} ({km(start.offsetKm)})
              </option>
            ))}
          </select>
        </div>
      )}

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
