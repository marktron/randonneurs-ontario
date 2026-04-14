'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface RoutePreviewLinkProps {
  name: string
  distance: string
  detailHref: string
  rwgpsUrl: string | null
  cueSheetUrl?: string | null
}

function extractRwgpsRouteId(url: string): string | null {
  const match = url.match(/ridewithgps\.com\/routes\/(\d+)/)
  return match ? match[1] : null
}

export function RoutePreviewLink({
  name,
  distance,
  detailHref,
  rwgpsUrl,
  cueSheetUrl,
}: RoutePreviewLinkProps) {
  const rwgpsRouteId = rwgpsUrl ? extractRwgpsRouteId(rwgpsUrl) : null
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  const primaryLink = (
    <Link href={detailHref} className="group flex min-w-0 flex-1 items-baseline gap-3 text-sm">
      <span className="truncate text-foreground transition-colors group-hover:text-primary">
        {name}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/80">{distance}</span>
    </Link>
  )

  const mapChipClassName =
    'group/map inline-flex shrink-0 items-center gap-1 rounded-sm py-1 text-muted-foreground/60 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

  const mapChipInner = (
    <>
      <span className="text-xs font-medium uppercase">Map</span>
      <ArrowUpRight className="h-3 w-3" />
    </>
  )

  // Plain external link — used as fallback and as the rendered trigger
  const plainRwgpsLink = rwgpsUrl ? (
    <a
      href={rwgpsUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} on RideWithGPS`}
      className={mapChipClassName}
    >
      {mapChipInner}
    </a>
  ) : null

  let mapChip: React.ReactNode = plainRwgpsLink

  if (rwgpsRouteId && rwgpsUrl) {
    const previewIframe = (
      <iframe
        src={`https://ridewithgps.com/embeds?type=route&id=${rwgpsRouteId}&sampleGraph=false&metricUnits=true&hideSurface=true`}
        className="h-full w-full"
        style={{ border: 'none' }}
        title={`${name} route preview`}
      />
    )

    if (isTouchDevice) {
      mapChip = (
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" aria-label={`Preview ${name} route`} className={mapChipClassName}>
              {mapChipInner}
            </button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-3xl overflow-hidden p-0">
            <VisuallyHidden>
              <DialogTitle>{name} route preview</DialogTitle>
            </VisuallyHidden>
            <div className="aspect-[4/3] w-full bg-muted">{previewIframe}</div>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3">
              <span className="font-serif text-base tracking-tight">{name}</span>
              <a
                href={rwgpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
              >
                View on RideWithGPS
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )
    } else {
      mapChip = (
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>{plainRwgpsLink}</HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="w-[600px] overflow-hidden rounded-lg p-0"
          >
            <div className="aspect-[4/3] w-full bg-muted">{previewIframe}</div>
          </HoverCardContent>
        </HoverCard>
      )
    }
  }

  const cueSheetChip = cueSheetUrl ? (
    <a
      href={cueSheetUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} cue sheet`}
      className={mapChipClassName}
    >
      <span className="text-xs font-medium uppercase">PDF</span>
      <FileText className="h-3 w-3" />
    </a>
  ) : null

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2">
      {primaryLink}
      <div className="flex shrink-0 items-center gap-3">
        {cueSheetChip}
        {mapChip}
      </div>
    </div>
  )
}
