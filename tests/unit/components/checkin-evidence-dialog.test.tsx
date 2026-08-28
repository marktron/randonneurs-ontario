/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckinEvidenceDialog } from '@/components/admin/checkin-evidence-dialog'
import type { CheckinEvidenceControl } from '@/lib/checkin-evidence'
import type { CheckinFlags } from '@/lib/brevet-card'

const NO_FLAGS: CheckinFlags = {
  outOfRadius: false,
  noGps: false,
  early: false,
  late: false,
  lateSync: false,
}

const CONTROLS: CheckinEvidenceControl[] = [
  {
    name: 'Start',
    distanceKm: 0,
    checkin: {
      checkedInAt: '2026-05-15T12:00:00Z',
      method: 'gps',
      flags: NO_FLAGS,
      distanceToControlM: 40,
      accuracyM: 12,
      locationFailureReason: null,
      locationFailureStage: null,
      locationElapsedMs: null,
      locationContext: null,
      note: null,
    },
  },
  {
    name: 'Mid',
    distanceKm: 90,
    checkin: null,
  },
  {
    name: 'Finish',
    distanceKm: 200,
    checkin: {
      checkedInAt: '2026-05-15T19:30:00Z',
      method: 'admin',
      flags: { ...NO_FLAGS, late: true },
      distanceToControlM: null,
      accuracyM: null,
      locationFailureReason: 'timeout',
      locationFailureStage: 'high_accuracy',
      locationElapsedMs: 42150,
      locationContext: 'embedded',
      note: 'Entered by organizer',
    },
  },
]

function renderDialog() {
  return render(
    <CheckinEvidenceDialog
      riderName="Anne Rider"
      eventId="event-1"
      controls={CONTROLS}
      open={true}
      onOpenChange={() => {}}
    />
  )
}

describe('CheckinEvidenceDialog', () => {
  it('shows the rider name and one row per control', () => {
    renderDialog()
    expect(screen.getByText('Anne Rider')).toBeTruthy()
    expect(screen.getByText('Start — 0 km')).toBeTruthy()
    expect(screen.getByText('Mid — 90 km')).toBeTruthy()
    expect(screen.getByText('Finish — 200 km')).toBeTruthy()
  })

  it('renders a dash for missed controls', () => {
    renderDialog()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('badges the method only for non-gps check-ins, plus warning flags', () => {
    renderDialog()
    expect(screen.getByText('admin')).toBeTruthy()
    expect(screen.queryByText('gps')).toBeNull()
    expect(screen.getByText('late')).toBeTruthy()
    expect(screen.queryByText('early')).toBeNull()
  })

  it('shows the GPS distance caption and the note when present', () => {
    renderDialog()
    expect(screen.getByText('40 m from control (±12 m)')).toBeTruthy()
    expect(screen.getByText('Entered by organizer')).toBeTruthy()
  })

  it('explains a no-GPS failure with its stage, timing, and context', () => {
    renderDialog()
    expect(
      screen.getByText(
        'No GPS: Location timed out during the high-accuracy attempt after 42 s (embedded browser)'
      )
    ).toBeTruthy()
  })

  it('links to the digital cards grid for corrections', () => {
    renderDialog()
    const link = screen.getByRole('link', { name: 'Manage check-ins' })
    expect(link.getAttribute('href')).toBe('/admin/events/event-1/brevet-card')
  })
})
