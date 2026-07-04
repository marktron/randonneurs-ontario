'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface CheckinMapRider {
  lat: number
  lng: number
  accuracyM: number | null
}

export interface CheckinMapControl {
  lat: number
  lng: number
  radiusM: number
}

interface CheckinMapProps {
  rider: CheckinMapRider | null
  control: CheckinMapControl | null
  className?: string
}

const RIDER_COLOR = '#2563eb' // blue-600
const CONTROL_COLOR = '#dc2626' // red-600

/**
 * Plain-Leaflet (no react-leaflet) map showing a rider's GPS check-in point
 * against the control's saved location. Uses circleMarker/L.circle instead
 * of Leaflet's default image markers, whose asset URLs 404 under bundlers.
 */
export function CheckinMap({ rider, control, className }: CheckinMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  // The effect keys on these primitives, not the rider/control objects: the
  // parent dialog rebuilds those objects on every keystroke, and an
  // object-identity dependency would tear down and re-create the map (and
  // re-fetch tiles) each time.
  const riderLat = rider?.lat ?? null
  const riderLng = rider?.lng ?? null
  const riderAccuracyM = rider?.accuracyM ?? null
  const controlLat = control?.lat ?? null
  const controlLng = control?.lng ?? null
  const controlRadiusM = control?.radiusM ?? null

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

      const points: [number, number][] = []
      // Radius circles (control radius, GPS accuracy) can extend well past
      // their center points, so the view is fitted to the circles' extents,
      // not just the markers. Tracked as center+radius rather than the
      // L.circle layers: circle.getBounds() throws before the map has a
      // view (layers attach via whenReady, and the map's first view IS the
      // fitBounds computed from these).
      const circleExtents: { center: [number, number]; radiusM: number }[] = []

      if (controlLat != null && controlLng != null && controlRadiusM != null) {
        const controlLatLng: [number, number] = [controlLat, controlLng]
        points.push(controlLatLng)
        L.circleMarker(controlLatLng, {
          radius: 7,
          color: '#fff',
          weight: 2,
          fillColor: CONTROL_COLOR,
          fillOpacity: 1,
        })
          .bindTooltip('Control')
          .addTo(map)
        L.circle(controlLatLng, {
          radius: controlRadiusM,
          color: CONTROL_COLOR,
          weight: 1,
          fillColor: CONTROL_COLOR,
          fillOpacity: 0.08,
        }).addTo(map)
        circleExtents.push({ center: controlLatLng, radiusM: controlRadiusM })
      }

      if (riderLat != null && riderLng != null) {
        const riderLatLng: [number, number] = [riderLat, riderLng]
        points.push(riderLatLng)
        L.circleMarker(riderLatLng, {
          radius: 7,
          color: '#fff',
          weight: 2,
          fillColor: RIDER_COLOR,
          fillOpacity: 1,
        })
          .bindTooltip('Rider check-in')
          .addTo(map)
        if (Number.isFinite(riderAccuracyM) && (riderAccuracyM as number) > 0) {
          L.circle(riderLatLng, {
            radius: riderAccuracyM as number,
            color: RIDER_COLOR,
            weight: 1,
            fillColor: RIDER_COLOR,
            fillOpacity: 0.08,
          }).addTo(map)
          circleExtents.push({ center: riderLatLng, radiusM: riderAccuracyM as number })
        }
      }

      if (points.length > 0) {
        const bounds = L.latLngBounds(points)
        for (const { center, radiusM } of circleExtents) {
          // toBounds() takes a box size, so a circle of radius r needs 2r.
          bounds.extend(L.latLng(center).toBounds(radiusM * 2))
        }
        if (points.length === 1 && circleExtents.length === 0) {
          map.setView(points[0], 15)
        } else {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
        }
      }
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [riderLat, riderLng, riderAccuracyM, controlLat, controlLng, controlRadiusM])

  return <div ref={containerRef} className={className ?? 'h-64 w-full rounded-md border'} />
}
