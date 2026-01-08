"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface RoutePreviewLinkProps {
  name: string;
  distance: string;
  url: string;
}

function extractRwgpsRouteId(url: string): string | null {
  const match = url.match(/ridewithgps\.com\/routes\/(\d+)/);
  return match ? match[1] : null;
}

export function RoutePreviewLink({ name, distance, url }: RoutePreviewLinkProps) {
  const rwgpsRouteId = extractRwgpsRouteId(url);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check for touch capability
    setIsTouchDevice(
      'ontouchstart' in window || navigator.maxTouchPoints > 0
    );
  }, []);

  const linkContent = (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-baseline gap-2 py-1.5 text-sm"
    >
      <span className="group-hover:text-primary transition-colors">
        {name}
      </span>
      <span className="text-muted-foreground tabular-nums text-xs">
        {distance}
      </span>
    </Link>
  );

  if (!rwgpsRouteId) {
    return linkContent;
  }

  const previewIframe = (
    <iframe
      src={`https://ridewithgps.com/embeds?type=route&id=${rwgpsRouteId}&sampleGraph=false&metricUnits=true&hideSurface=true`}
      className="w-full h-full"
      style={{ border: "none" }}
      title={`${name} route preview`}
    />
  );

  // Touch devices: Use Dialog with tap-to-preview button
  if (isTouchDevice) {
    return (
      <div className="flex items-baseline gap-3">
        {linkContent}
        <Dialog>
          <DialogTrigger asChild>
            <button
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
              aria-label={`Preview ${name} route`}
            >
              preview
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden">
            <VisuallyHidden>
              <DialogTitle>{name} Route Preview</DialogTitle>
            </VisuallyHidden>
            <div className="aspect-[4/3] w-full">
              {previewIframe}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Desktop: Use HoverCard
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {linkContent}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-[600px] p-0 overflow-hidden rounded-lg"
      >
        <div className="aspect-[4/3] w-full">
          {previewIframe}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}