/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteStartPicker } from '@/components/route-start-picker'
import { buildRouteTrack, type RouteControl, type TrackPoint } from '@/lib/routeTrack'

/**
 * Chainable Leaflet stand-in. It records each control marker group's tooltip
 * and click handler so a test can tap a marker without a real map.
 */
const markerGroups: { tooltip: string; click: () => void }[] = []
function layer() {
  const l: Record<string, unknown> = {}
  Object.assign(l, {
    addTo: () => l,
    bindTooltip: () => l,
    on: () => l,
    remove: () => {},
    bringToFront: () => l,
    getBounds: () => ({}),
  })
  return l
}
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({ on: vi.fn(), fitBounds: vi.fn(), remove: vi.fn() })),
  tileLayer: vi.fn(layer),
  polyline: vi.fn(layer),
  circleMarker: vi.fn(layer),
  featureGroup: vi.fn(() => {
    const entry = { tooltip: '', click: () => {} }
    markerGroups.push(entry)
    const group = {
      bindTooltip: (text: string) => {
        entry.tooltip = text
        return group
      },
      on: (event: string, handler: () => void) => {
        if (event === 'click') entry.click = handler
        return group
      },
      addTo: () => group,
    }
    return group
  }),
}))
vi.mock('leaflet/dist/leaflet.css', () => ({}))

// 20 km out-and-back: step i sits at lat 44 + i * 0.001, passed at
// km i * 0.1112 going out and km (180 - i) * 0.1112 coming back.
const STEP_KM = 0.1112
const points: TrackPoint[] = [
  ...Array.from({ length: 91 }, (_, i) => ({ lat: 44 + i * 0.001, lng: -79, km: i * STEP_KM })),
  ...Array.from({ length: 90 }, (_, k) => {
    const j = 91 + k
    return { lat: 44 + (180 - j) * 0.001, lng: -79, km: j * STEP_KM }
  }),
]
const track = buildRouteTrack(points, 20.016)!

const controls: RouteControl[] = [
  { name: 'Start', km: 0, lat: 44, lng: -79 },
  { name: 'Cafe', km: 3.3, lat: 44.03, lng: -79 },
  { name: 'Turnaround', km: 10, lat: 44.09, lng: -79 },
  { name: 'Cafe', km: 16.7, lat: 44.03, lng: -79 },
  { name: 'Finish', km: 20, lat: 44, lng: -79 },
]

describe('RouteStartPicker controls', () => {
  beforeEach(() => {
    markerGroups.length = 0
  })

  it('lists the offered controls in route order, one option per pass', () => {
    render(<RouteStartPicker track={track} valueKm={null} onChange={vi.fn()} controls={controls} />)
    const select = screen.getByLabelText('Or start at a control')
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual([
      'Choose a control',
      'Cafe (3.3 km)',
      'Turnaround (10.0 km)',
      'Cafe (16.7 km)',
    ])
    expect(select).toHaveValue('')
  })

  it('starts exactly at the chosen control and suggests its name', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onPickControl = vi.fn()
    render(
      <RouteStartPicker
        track={track}
        valueKm={null}
        onChange={onChange}
        controls={controls}
        onPickControl={onPickControl}
      />
    )
    const select = screen.getByLabelText('Or start at a control')
    const option = screen.getByRole('option', { name: 'Cafe (16.7 km)' }) as HTMLOptionElement
    await user.selectOptions(select, option.value)
    expect(onChange).toHaveBeenCalledWith(16.7)
    expect(onPickControl).toHaveBeenCalledWith('Cafe')
  })

  it('shows the chosen control when the start is exactly one', () => {
    render(<RouteStartPicker track={track} valueKm={10} onChange={vi.fn()} controls={controls} />)
    const select = screen.getByLabelText('Or start at a control') as HTMLSelectElement
    expect(select.selectedOptions[0].textContent).toBe('Turnaround (10.0 km)')
  })

  it('omits the control list when no control is offered', () => {
    render(
      <RouteStartPicker
        track={track}
        valueKm={null}
        onChange={vi.fn()}
        controls={[controls[0], controls[4]]}
      />
    )
    expect(screen.queryByLabelText('Or start at a control')).not.toBeInTheDocument()
  })

  it('marks each control place once, and a tap starts at its first pass and offers the others', async () => {
    const onChange = vi.fn()
    const onPickControl = vi.fn()
    render(
      <RouteStartPicker
        track={track}
        valueKm={null}
        onChange={onChange}
        controls={controls}
        onPickControl={onPickControl}
      />
    )
    await waitFor(() => expect(markerGroups).toHaveLength(2))
    expect(markerGroups.map((g) => g.tooltip)).toEqual([
      'Cafe, 3.3 km and 16.7 km',
      'Turnaround, 10.0 km',
    ])

    markerGroups[0].click()
    expect(onChange).toHaveBeenLastCalledWith(3.3)
    expect(onPickControl).toHaveBeenLastCalledWith('Cafe')
    expect(
      await screen.findByRole('group', { name: 'Which pass of the route?' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16.7 km' })).toBeInTheDocument()
  })
})
