/**
 * Test fixtures for results
 */

export const mockResult = {
  id: 'result-1',
  event_id: 'event-1',
  rider_id: 'rider-1',
  finish_time: '13:30',
  status: 'finished',
  team_name: null,
  note: null,
  season: 2025,
  distance_km: 200,
}

export const mockResults = [
  {
    id: 'result-1',
    event_id: 'event-1',
    rider_id: 'rider-1',
    finish_time: '13:30',
    status: 'finished',
    team_name: null,
    note: null,
    season: 2025,
    distance_km: 200,
  },
  {
    id: 'result-2',
    event_id: 'event-1',
    rider_id: 'rider-2',
    finish_time: null,
    status: 'dnf',
    team_name: null,
    note: 'Mechanical issue',
    season: 2025,
    distance_km: 200,
  },
]
