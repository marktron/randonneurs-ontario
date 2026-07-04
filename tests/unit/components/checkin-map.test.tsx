/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { CheckinMap } from '@/components/admin/checkin-map'

/**
 * Leaflet mock that reproduces the library's lazy layer attachment: layers
 * added before the map has a view (setView/fitBounds) are not attached, so
 * circle.getBounds() throws "this._map is undefined" — exactly what happens
 * in the real component, where the first view IS the fitBounds being
 * computed. The component must therefore never call circle.getBounds().
 */
const mapInstance = {
  hasView: false,
  setView: vi.fn(function (this: { hasView: boolean }) {
    this.hasView = true
  }),
  fitBounds: vi.fn(function (this: { hasView: boolean }) {
    this.hasView = true
  }),
  remove: vi.fn(),
}

const boundsInstance = { extend: vi.fn() }

vi.mock('leaflet', () => ({
  map: vi.fn(() => mapInstance),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  circleMarker: vi.fn(() => {
    const marker = { bindTooltip: vi.fn(), addTo: vi.fn() }
    marker.bindTooltip = vi.fn(() => marker)
    return marker
  }),
  circle: vi.fn(() => ({
    addTo: vi.fn(),
    getBounds: vi.fn(() => {
      if (!mapInstance.hasView) {
        throw new TypeError(
          "undefined is not an object (evaluating 'this._map.layerPointToLatLng')"
        )
      }
      return boundsInstance
    }),
  })),
  latLng: vi.fn((latlng: [number, number]) => ({
    toBounds: vi.fn(() => ({ mockCircleBox: latlng })),
  })),
  latLngBounds: vi.fn(() => boundsInstance),
}))

vi.mock('leaflet/dist/leaflet.css', () => ({}))

describe('CheckinMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapInstance.hasView = false
  })

  it('fits the view without reading bounds from unattached circle layers', async () => {
    render(
      <CheckinMap
        rider={{ lat: 43.65, lng: -79.38, accuracyM: 25 }}
        control={{ lat: 43.66, lng: -79.4, radiusM: 500 }}
      />
    )

    // With the bug, circle.getBounds() throws before fitBounds is ever
    // reached, so this never resolves.
    await waitFor(() => expect(mapInstance.fitBounds).toHaveBeenCalledTimes(1))
    // Both circles' boxes (control radius + rider accuracy) still widen the
    // fitted bounds.
    expect(boundsInstance.extend).toHaveBeenCalledWith({ mockCircleBox: [43.66, -79.4] })
    expect(boundsInstance.extend).toHaveBeenCalledWith({ mockCircleBox: [43.65, -79.38] })
  })

  it('uses setView for a lone rider point with no circles', async () => {
    render(<CheckinMap rider={{ lat: 43.65, lng: -79.38, accuracyM: null }} control={null} />)

    await waitFor(() => expect(mapInstance.setView).toHaveBeenCalledWith([43.65, -79.38], 15))
    expect(mapInstance.fitBounds).not.toHaveBeenCalled()
  })
})
