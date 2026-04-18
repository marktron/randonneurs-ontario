export function formatRideName(eventName: string, eventDistance: number | string): string {
  const trimmed = eventName.trim()
  const distance = String(eventDistance)
  if (trimmed.endsWith(` ${distance}`) || trimmed.toLowerCase().endsWith(` ${distance}km`)) {
    return trimmed
  }
  return `${trimmed} ${distance}km`
}
