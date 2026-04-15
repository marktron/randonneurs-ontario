'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CloudSun, Loader2, ExternalLink } from 'lucide-react'
import { syncEventToErw } from '@/lib/actions/erw-sync'

interface ErwSyncButtonProps {
  eventId: string
  erwCanonicalUrl: string | null
}

export function ErwSyncButton({ eventId, erwCanonicalUrl }: ErwSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [url, setUrl] = useState(erwCanonicalUrl)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    const result = await syncEventToErw(eventId)
    setSyncing(false)

    if (result.success && result.data) {
      setUrl(result.data.canonicalUrl)
    } else {
      setError(result.error || 'Sync failed')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CloudSun className="h-4 w-4 mr-2" />
        )}
        {url ? 'Re-sync to ERW' : 'Sync to ERW'}
      </Button>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          View
        </a>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
