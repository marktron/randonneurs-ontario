/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteStartDialog } from '@/components/route-start-dialog'

// Leaflet does not run in happy-dom; the picker is a stand-in.
vi.mock('@/components/route-start-picker', () => ({
  RouteStartPicker: ({ onChange }: { onChange: (km: number | null) => void }) => (
    <div data-testid="route-start-picker">
      <button type="button" onClick={() => onChange(42.3)}>
        Drop pin
      </button>
    </div>
  ),
}))

const track = { points: [], totalKm: 204.5, isLoop: true }

function Harness({ initialKm = null }: { initialKm?: number | null }) {
  const [open, setOpen] = useState(true)
  const [km, setKm] = useState<number | null>(initialKm)
  return (
    <>
      <span data-testid="open">{open ? 'open' : 'closed'}</span>
      <RouteStartDialog
        open={open}
        onOpenChange={setOpen}
        track={track}
        valueKm={km}
        onChange={setKm}
      />
    </>
  )
}

describe('RouteStartDialog', () => {
  it('has an accessible title and description', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Choose where you start' })
    expect(dialog).toHaveAccessibleDescription(/tap the route/i)
  })

  it('says the posted start is selected until the rider picks a start', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('Starting at the posted start')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Drop pin' }))
    expect(screen.getByText('Starts 42.3 km into the posted route')).toBeInTheDocument()
  })

  it('shows the current start when reopened', () => {
    render(<Harness initialKm={58.9} />)
    expect(screen.getByText('Starts 58.9 km into the posted route')).toBeInTheDocument()
  })

  it('opens with focus on the dialog itself, so nothing looks chosen', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })

  it('closes on Done', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('open')).toHaveTextContent('closed')
  })
})
