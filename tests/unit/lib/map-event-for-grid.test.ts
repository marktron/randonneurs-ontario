import { describe, it, expect } from 'vitest'
import { mapEventForGrid } from '@/lib/admin/map-event-for-grid'
import type { EventForAdminList } from '@/types/queries'

const base: EventForAdminList = {
  id: 'evt-1',
  name: 'Kissing Bridge',
  event_date: '2027-07-25',
  distance_km: 300,
  event_type: 'brevet',
  status: 'draft',
  chapter_id: 'chapter-1',
  start_time: '07:00:00',
  chapters: { name: 'Toronto' },
  rider_count: 0,
} as EventForAdminList

describe('mapEventForGrid', () => {
  it('maps snake_case admin rows to the public Event shape', () => {
    expect(mapEventForGrid(base)).toEqual({
      id: 'evt-1',
      slug: 'evt-1',
      date: '2027-07-25',
      name: 'Kissing Bridge',
      type: 'Brevet',
      distance: '300',
      startLocation: '',
      startTime: '07:00',
      status: 'draft',
      chapterName: 'Toronto',
    })
  })

  it('falls back to 00:00 when start_time is null', () => {
    expect(mapEventForGrid({ ...base, start_time: null }).startTime).toBe('00:00')
  })

  it('passes scheduled and cancelled through and folds other statuses to scheduled', () => {
    expect(mapEventForGrid({ ...base, status: 'cancelled' }).status).toBe('cancelled')
    expect(mapEventForGrid({ ...base, status: 'completed' }).status).toBe('scheduled')
  })

  it('capitalises event types', () => {
    expect(mapEventForGrid({ ...base, event_type: 'fleche' }).type).toBe('Fleche')
    expect(mapEventForGrid({ ...base, event_type: 'permanent' }).type).toBe('Permanent')
  })
})
