'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Printer, GripVertical } from 'lucide-react'
import type { CardRider } from '@/types/control-card'

interface ControlInput {
  id: string
  name: string
  distance: string
}

interface EventInput {
  id: string
  name: string
  routeName: string
  distance: number
  eventDate: string
  startTime: string
  startLocation: string
  chapter: string
}

interface ControlCardsFormProps {
  event: EventInput
  riders: CardRider[]
}

export function ControlCardsForm({ event, riders }: ControlCardsFormProps) {
  // Organizer details
  const [organizerName, setOrganizerName] = useState('')
  const [organizerPhone, setOrganizerPhone] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')

  // Controls - initialize with start and finish
  const [controls, setControls] = useState<ControlInput[]>([
    { id: crypto.randomUUID(), name: event.startLocation || 'Start', distance: '0' },
    { id: crypto.randomUUID(), name: 'Finish', distance: String(event.distance) },
  ])

  const addControl = useCallback(() => {
    // Insert before the last control (finish)
    const newControl = { id: crypto.randomUUID(), name: '', distance: '' }
    setControls((prev) => [...prev.slice(0, -1), newControl, prev[prev.length - 1]])
  }, [])

  const removeControl = useCallback((id: string) => {
    setControls((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateControl = useCallback((id: string, field: 'name' | 'distance', value: string) => {
    setControls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }, [])

  const moveControl = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= controls.length) return

    setControls((prev) => {
      const newControls = [...prev]
      const [moved] = newControls.splice(fromIndex, 1)
      newControls.splice(toIndex, 0, moved)
      return newControls
    })
  }, [controls.length])

  const generatePrintUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('organizerName', organizerName)
    params.set('organizerPhone', organizerPhone)
    params.set('organizerEmail', organizerEmail)

    // Sort controls by distance before encoding
    const sortedControls = [...controls].sort(
      (a, b) => parseFloat(a.distance || '0') - parseFloat(b.distance || '0')
    )
    params.set('controls', JSON.stringify(sortedControls.map((c) => ({
      name: c.name,
      distance: parseFloat(c.distance || '0'),
    }))))

    return `/admin/events/${event.id}/control-cards/print?${params.toString()}`
  }, [event.id, organizerName, organizerPhone, organizerEmail, controls])

  const isFormValid = organizerName && organizerPhone && organizerEmail &&
    controls.every((c) => c.name && c.distance !== '')

  return (
    <div className="space-y-6">
      {/* Organizer Details */}
      <Card>
        <CardHeader>
          <CardTitle>Ride Organizer Details</CardTitle>
          <CardDescription>
            Contact information displayed on the control cards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="organizerName">Name</Label>
              <Input
                id="organizerName"
                placeholder="John Smith"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizerPhone">Phone</Label>
              <Input
                id="organizerPhone"
                placeholder="416-555-1234"
                value={organizerPhone}
                onChange={(e) => setOrganizerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizerEmail">Email</Label>
              <Input
                id="organizerEmail"
                type="email"
                placeholder="organizer@example.com"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Control Points */}
      <Card>
        <CardHeader>
          <CardTitle>Control Points</CardTitle>
          <CardDescription>
            Define control checkpoints along the route. Times will be calculated automatically based on BRM rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {controls.map((control, index) => (
              <div key={control.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveControl(index, 'up')}
                      disabled={index === 0}
                      className="h-3 hover:text-foreground disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveControl(index, 'down')}
                      disabled={index === controls.length - 1}
                      className="h-3 hover:text-foreground disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>
                <Input
                  placeholder="Control name"
                  value={control.name}
                  onChange={(e) => updateControl(control.id, 'name', e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="km"
                    value={control.distance}
                    onChange={(e) => updateControl(control.id, 'distance', e.target.value)}
                    className="w-24"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-sm text-muted-foreground">km</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeControl(control.id)}
                  disabled={controls.length <= 2}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addControl}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Control
          </Button>
        </CardContent>
      </Card>

      {/* Registered Riders */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Riders ({riders.length})</CardTitle>
          <CardDescription>
            Control cards will be generated for these riders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No riders registered for this event.</p>
          ) : (
            <div className="grid gap-1 md:grid-cols-3">
              {riders.map((rider) => (
                <div key={rider.id} className="text-sm">
                  {rider.firstName} {rider.lastName}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button
          asChild
          disabled={!isFormValid || riders.length === 0}
        >
          <a
            href={isFormValid && riders.length > 0 ? generatePrintUrl() : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={!isFormValid || riders.length === 0 ? 'pointer-events-none opacity-50' : ''}
          >
            <Printer className="h-4 w-4 mr-2" />
            Generate Control Cards
          </a>
        </Button>
        {!isFormValid && (
          <p className="text-sm text-muted-foreground self-center">
            Please fill in all organizer details and control points.
          </p>
        )}
      </div>
    </div>
  )
}
