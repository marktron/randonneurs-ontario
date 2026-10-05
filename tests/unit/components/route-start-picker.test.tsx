/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteStartPicker } from '@/components/route-start-picker'
import { buildRouteTrack, type RouteControl, type TrackPoint } from '@/lib/routeTrack'

/**
 * Chainable Leaflet stand-in. It records each control flag's tooltip, click
 * handler and current icon so a test can tap a flag without a real map.
 */
type FakeIcon = { html: string; className?: string }
const flags: { tooltip: string; click: () => void; icon: FakeIcon }[] = []
const circleMarkers: { fillColor?: string }[] = []
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
  circleMarker: vi.fn((_at: unknown, options: { fillColor?: string }) => {
    circleMarkers.push(options)
    return layer()
  }),
  divIcon: vi.fn((options: FakeIcon) => options),
  marker: vi.fn((_at: unknown, options: { icon: FakeIcon }) => {
    const entry = { tooltip: '', click: () => {}, icon: options.icon }
    flags.push(entry)
    const marker = {
      bindTooltip: (text: string) => {
        entry.tooltip = text
        return marker
      },
      on: (event: string, handler: () => void) => {
        if (event === 'click') entry.click = handler
        return marker
      },
      setIcon: (icon: FakeIcon) => {
        entry.icon = icon
        return marker
      },
      setZIndexOffset: () => marker,
      addTo: () => marker,
    }
    return marker
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
    flags.length = 0
    circleMarkers.length = 0
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
    expect(onPickControl).toHaveBeenCalledWith('Cafe', [3.3, 16.7])
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

  it('flags each control place once, and a tap starts at its first pass and offers the others', async () => {
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
    await waitFor(() => expect(flags).toHaveLength(2))
    expect(flags.map((g) => g.tooltip)).toEqual(['Cafe, 3.3 km and 16.7 km', 'Turnaround, 10.0 km'])

    flags[0].click()
    expect(onChange).toHaveBeenLastCalledWith(3.3)
    expect(onPickControl).toHaveBeenLastCalledWith('Cafe', [3.3, 16.7])
    expect(
      await screen.findByRole('group', { name: 'Which pass of the route?' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16.7 km' })).toBeInTheDocument()
  })

  it('draws a start at a control as that blue flag, with no separate pin', async () => {
    const { rerender } = render(
      <RouteStartPicker track={track} valueKm={null} onChange={vi.fn()} controls={controls} />
    )
    await waitFor(() => expect(flags).toHaveLength(2))
    const PIN = '#2563eb'
    expect(flags.every((f) => !f.icon.html.includes(PIN))).toBe(true)

    rerender(
      <RouteStartPicker track={track} valueKm={16.7} onChange={vi.fn()} controls={controls} />
    )
    await waitFor(() => expect(flags[0].icon.html).toContain(PIN))
    expect(flags[1].icon.html).not.toContain(PIN)
    expect(circleMarkers.some((m) => m.fillColor === PIN)).toBe(false)

    // A start away from any control is the usual pin, and every flag is plain.
    rerender(<RouteStartPicker track={track} valueKm={7} onChange={vi.fn()} controls={controls} />)
    await waitFor(() => expect(circleMarkers.some((m) => m.fillColor === PIN)).toBe(true))
    expect(flags.every((f) => !f.icon.html.includes(PIN))).toBe(true)
  })

  it('takes taps only on the flag itself: a 44 px circle on the control and the pennant', async () => {
    render(<RouteStartPicker track={track} valueKm={null} onChange={vi.fn()} controls={controls} />)
    await waitFor(() => expect(flags).toHaveLength(2))
    const icon = flags[0].icon
    // The icon box ignores the pointer; only the drawn tap shapes take it.
    expect(icon.className).toContain('pointer-events-none!')
    const svg = new DOMParser().parseFromString(icon.html, 'text/html')
    const hits = Array.from(svg.querySelectorAll('[data-hit]'))
    expect(hits.map((h) => h.getAttribute('pointer-events'))).toEqual(['all', 'all'])
    const circle = svg.querySelector('circle[data-hit]')!
    expect(circle.getAttribute('r')).toBe('22')
    // Centred on the pole base, which is the icon's anchor (the control).
    expect([circle.getAttribute('cx'), circle.getAttribute('cy')]).toEqual(['22', '27'])
  })
})
