interface ControlInput {
  id: string
  name: string
  distance: string
}

/**
 * Reverse control points for a route ridden in the opposite direction.
 * Reverses the array order and recalculates distances as (totalDistance - originalDistance).
 */
export function reverseControls(controls: ControlInput[], totalDistance: number): ControlInput[] {
  return [...controls].reverse().map((control) => ({
    ...control,
    distance: (totalDistance - parseFloat(control.distance)).toFixed(1),
  }))
}

/**
 * Check if an event name indicates a reversed permanent route.
 */
export function isReversedEvent(eventName: string): boolean {
  return eventName.includes('(Reversed)')
}
