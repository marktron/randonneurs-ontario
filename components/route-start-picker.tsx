'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { CircleMarker, DivIcon, Map as LeafletMap, Marker } from 'leaflet'
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
  /** Called when the rider starts at a control, with its name and every pass's distance. */
  onPickControl?: (name: string, passesKm: number[]) => void
  disabled?: boolean
}

const ROUTE_COLOR = '#dc2626' // red-600
const PIN_COLOR = '#2563eb' // blue-600
const CONTROL_COLOR = '#1c1917' // stone-900, the style guide's near-black ink
const NO_CONTROLS: RouteControl[] = []

// The chosen start, drawn the same whether it is a free point (a circle
// marker) or a control (the base of its flag): path radius and white ring, px.
const START_DOT_RADIUS = 6
const START_DOT_RING = 2

// Flag marker geometry, in px within the icon. The pole's base (the anchor)
// sits on the control; the pennant flies up and to the right so the route line
// stays visible underneath. The tap area is drawn to match what the rider sees
// (see flagSvg), so taps on the route beside a control reach the map.
const FLAG_SIZE: [number, number] = [44, 50]
const FLAG_BASE: [number, number] = [22, 27]
const POLE = 24
const PENNANT = { width: 16, top: POLE, bottom: POLE - 10.5 }
const HIT_RADIUS = 22 // a 44 px circle on the control itself

/**
 * A small flag on a pole with a dot at its base. The chosen start's flag is
 * pin blue and its base is the start dot itself.
 */
function flagSvg(selected: boolean): string {
  const color = selected ? PIN_COLOR : CONTROL_COLOR
  const [x, y] = FLAG_BASE
  const mid = (PENNANT.top + PENNANT.bottom) / 2
  const [w, h] = FLAG_SIZE
  // The icon box ignores the pointer (see flagIcon); only these two invisible
  // shapes take taps: a circle on the control and a slim box over the pennant
  // and the top of the pole. Everything visible ignores the pointer.
  const hit = `fill="none" pointer-events="all" style="cursor:pointer"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" aria-hidden="true">
<g pointer-events="none">
<line x1="${x}" y1="${y}" x2="${x}" y2="${y - POLE}" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
<line x1="${x}" y1="${y}" x2="${x}" y2="${y - POLE}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
<path d="M${x} ${y - PENNANT.top} L${x + PENNANT.width} ${y - mid} L${x} ${y - PENNANT.bottom} Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
${
  selected
    ? `<circle cx="${x}" cy="${y}" r="${START_DOT_RADIUS}" fill="${PIN_COLOR}" stroke="#fff" stroke-width="${START_DOT_RING}"/>`
    : `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>`
}
</g>
<circle data-hit cx="${x}" cy="${y}" r="${HIT_RADIUS}" ${hit}/>
<rect data-hit x="${x - 3}" y="${y - POLE - 3}" width="${PENNANT.width + 6}" height="${PENNANT.top - PENNANT.bottom + 6}" ${hit}/>
</svg>`
}

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
  const flagsRef = useRef<{ place: ControlPlace; marker: Marker }[]>([])
  const flagIconsRef = useRef<{ plain: DivIcon; selected: DivIcon } | null>(null)
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
    onPickControl?.(
      place.name,
      place.passes.map((p) => p.offsetKm)
    )
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
    let resizeObserver: ResizeObserver | null = null

    ;(async () => {
      const L = await import('leaflet')
      if (cancelled || !containerRef.current) return

      // Whole zoom levels only: fractional zoom leaves hairline gaps between tiles.
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
      const postedStart = L.circleMarker([first.lat, first.lng], {
        radius: 6,
        color: ROUTE_COLOR,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }).bindTooltip('Posted start')
      // Leaflet's tooltip adds focus and blur listeners to this dot's SVG path,
      // and Chromium treats an SVG element with focus listeners as focusable,
      // which made the unnamed dot a tab stop. Keep it out of the tab order,
      // like the flags. Its element exists only once the map has a view, hence
      // the add event.
      postedStart.on('add', () => postedStart.getElement()?.setAttribute('tabindex', '-1'))
      postedStart.addTo(map)

      // Each control is a flag. A class of our own replaces Leaflet's default
      // white `leaflet-div-icon` box, and the box itself ignores the pointer
      // (`!` beats leaflet.css) so only the flag's drawn tap area takes taps.
      // The flags are not tab stops; the control list is the keyboard path.
      const flagIcon = (selected: boolean) =>
        L.divIcon({
          html: flagSvg(selected),
          className: 'outline-none pointer-events-none!',
          iconSize: FLAG_SIZE,
          iconAnchor: FLAG_BASE,
          tooltipAnchor: [16, -16],
        })
      flagIconsRef.current = { plain: flagIcon(false), selected: flagIcon(true) }
      flagsRef.current = places.map((place) => ({
        place,
        marker: L.marker([place.lat, place.lng], {
          icon: flagIconsRef.current!.plain,
          keyboard: false,
          riseOnHover: true,
          // A tap on a flag must not also reach the map, which would re-snap it.
          bubblingMouseEvents: false,
        })
          // Long control names wrap instead of running past the map's edge on a
          // phone. `!` because leaflet.css sets white-space after Tailwind's layer.
          .bindTooltip(describePlace(place), {
            className: 'w-max! max-w-40! whitespace-normal!',
          })
          .on('click', () => onControlTap(place))
          .addTo(map),
      }))

      // The map may be created while its dialog is still opening, so Leaflet
      // re-measures whenever the container's size changes, and the route is
      // fitted once the container first has a size.
      const container = containerRef.current
      let fitted = false
      const fitOnceSized = () => {
        if (fitted || container.clientWidth === 0 || container.clientHeight === 0) return
        // Extra room above and to the right for a flag's pennant at the edge,
        // kept small so long routes still open a zoom level closer on a phone.
        map.fitBounds(line.getBounds(), { paddingTopLeft: [4, 30], paddingBottomRight: [18, 8] })
        fitted = true
      }
      fitOnceSized()
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize()
          fitOnceSized()
        })
        resizeObserver.observe(container)
      }
      map.on('click', (e) => onTap(e.latlng.lat, e.latlng.lng))
      setReady(true)
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      pinRef.current = null
      flagsRef.current = []
      flagIconsRef.current = null
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

      // A start exactly at a control turns that control's flag blue and
      // stands in for the pin, whose dot would sit under the flag's base.
      const icons = flagIconsRef.current
      let onControl = false
      for (const { place, marker } of flagsRef.current) {
        const selected = valueKm != null && place.passes.some((s) => s.offsetKm === valueKm)
        onControl ||= selected
        if (icons) marker.setIcon(selected ? icons.selected : icons.plain)
        marker.setZIndexOffset(selected ? 1000 : 0)
      }
      if (valueKm == null || onControl) return
      const p = pointAtKm(track, valueKm)
      // Not interactive: a tap on the pin reaches the control marker or the
      // map underneath it.
      pinRef.current = L.circleMarker([p.lat, p.lng], {
        radius: START_DOT_RADIUS,
        color: '#fff',
        weight: START_DOT_RING,
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
    // Fills the height its (flex column) parent gives it: the map takes what is
    // left after the controls, which scroll on their own if a phone is short.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* isolate keeps Leaflet's pane and control z-indexes (400 to 1000)
          inside the map, below the rest of the dialog. */}
      <div
        ref={containerRef}
        role="region"
        aria-label="Route map. Tap the route to choose where you will start."
        className="isolate min-h-48 w-full flex-1 rounded-lg border border-border"
      />

      <div className="max-h-[40dvh] shrink-0 space-y-3 overflow-y-auto p-1">
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
    </div>
  )
}
