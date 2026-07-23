'use client'

import { useState } from 'react'
import { ExternalLink, Mountain } from 'lucide-react'
import { RwgpsEmbed } from '@/components/rwgps-embed'
import { cn } from '@/lib/utils'
import type { RwgpsCollection } from '@/lib/rwgps'

interface RwgpsCollectionEmbedProps {
  collection: RwgpsCollection
}

/**
 * Leg list + single map for a RWGPS collection (multi-leg events beyond
 * 1200 km). One embed is loaded at a time — collections can hold 7+ legs and
 * each embed is a heavy 500px iframe.
 */
export function RwgpsCollectionEmbed({ collection }: RwgpsCollectionEmbedProps) {
  const [selected, setSelected] = useState(collection.routes[0])

  // fetchRwgpsCollection never returns an empty collection, but the props
  // type permits routes: [] — bail out rather than crash on selected.id.
  if (!selected) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Collection legs">
        {collection.routes.map((leg) => {
          const isSelected = leg.id === selected.id
          return (
            <button
              key={leg.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(leg)}
              className={cn(
                'rounded border px-3 py-2 text-left text-sm transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <span className="block font-medium">{leg.name}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                {Math.round(leg.distanceKm)} km
                <span className="inline-flex items-center gap-0.5">
                  <Mountain className="h-3 w-3" />
                  {Math.round(leg.elevationGain).toLocaleString('en-US')} m
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <RwgpsEmbed key={selected.id} routeId={selected.id} title={selected.name} />

      <p className="text-sm">
        <a
          href={collection.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline underline-offset-2"
        >
          View full collection on Ride with GPS
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  )
}
