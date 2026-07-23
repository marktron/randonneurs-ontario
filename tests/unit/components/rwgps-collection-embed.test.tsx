/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RwgpsCollectionEmbed } from '@/components/rwgps-collection-embed'
import type { RwgpsCollection } from '@/lib/rwgps'

const collection: RwgpsCollection = {
  name: 'Cottage Country Explorer 2000',
  htmlUrl: 'https://ridewithgps.com/collections/8387874',
  routes: [
    {
      id: 56239318,
      name: 'Leg 1: CCE 300 - Port Loring',
      distanceKm: 314.2,
      elevationGain: 3000,
      htmlUrl: 'https://ridewithgps.com/routes/56239318',
    },
    {
      id: 56239304,
      name: 'Leg 2: CCE 500 - Lake Simcoe',
      distanceKm: 496.0,
      elevationGain: 5000,
      htmlUrl: 'https://ridewithgps.com/routes/56239304',
    },
  ],
}

describe('RwgpsCollectionEmbed', () => {
  it('renders a row per leg with distance and elevation', () => {
    render(<RwgpsCollectionEmbed collection={collection} />)
    expect(screen.getByText('Leg 1: CCE 300 - Port Loring')).toBeInTheDocument()
    expect(screen.getByText('Leg 2: CCE 500 - Lake Simcoe')).toBeInTheDocument()
    expect(screen.getByText(/314 km/)).toBeInTheDocument()
    expect(screen.getByText(/3,000 m/)).toBeInTheDocument()
  })

  it('embeds the first leg by default and switches on selection', async () => {
    const user = userEvent.setup()
    render(<RwgpsCollectionEmbed collection={collection} />)
    expect(screen.getByTitle('Leg 1: CCE 300 - Port Loring')).toHaveAttribute(
      'src',
      expect.stringContaining('id=56239318')
    )
    await user.click(screen.getByRole('button', { name: /Leg 2/ }))
    expect(screen.getByTitle('Leg 2: CCE 500 - Lake Simcoe')).toHaveAttribute(
      'src',
      expect.stringContaining('id=56239304')
    )
  })

  it('links to the full collection on RWGPS', () => {
    render(<RwgpsCollectionEmbed collection={collection} />)
    const link = screen.getByRole('link', { name: /view full collection/i })
    expect(link).toHaveAttribute('href', 'https://ridewithgps.com/collections/8387874')
  })
})
