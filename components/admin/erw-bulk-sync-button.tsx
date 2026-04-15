'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CloudSun, Loader2 } from 'lucide-react'
import { syncAllEventsToErw } from '@/lib/actions/erw-sync'

export function ErwBulkSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{
    synced: number
    failed: number
    errors: string[]
  } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    const response = await syncAllEventsToErw()
    setSyncing(false)

    if (response.success && response.data) {
      setResult(response.data)
    } else {
      setResult({ synced: 0, failed: 0, errors: [response.error || 'Sync failed'] })
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CloudSun className="h-4 w-4 mr-2" />
        )}
        Bulk Sync to ERW
      </Button>
      {result && (
        <p className="text-sm text-muted-foreground">
          Synced {result.synced}, failed {result.failed}
          {result.errors.length > 0 && (
            <span className="block text-destructive mt-1">{result.errors.join('; ')}</span>
          )}
        </p>
      )}
    </div>
  )
}
