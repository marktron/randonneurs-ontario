/**
 * Test fixtures for riders
 */

import type { RiderListItem } from '@/lib/data/riders'

export const mockRiders: RiderListItem[] = [
  {
    slug: 'john-doe',
    firstName: 'John',
    lastName: 'Doe',
  },
  {
    slug: 'jane-smith',
    firstName: 'Jane',
    lastName: 'Smith',
  },
  {
    slug: 'bob-anderson',
    firstName: 'Bob',
    lastName: 'Anderson',
  },
]

export const mockRiderWithResults = {
  id: 'rider-1',
  slug: 'john-doe',
  first_name: 'John',
  last_name: 'Doe',
  results: [
    {
      rider_id: 'rider-1',
      season: 2025,
    },
    {
      rider_id: 'rider-1',
      season: 2024,
    },
  ],
}
