'use client'

export function LocalTime({ dateString }: { dateString: string }) {
  return (
    <time dateTime={dateString} suppressHydrationWarning>
      {new Date(dateString).toLocaleString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </time>
  )
}
