"use client";

import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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
          <iframe
            src={`https://ridewithgps.com/embeds?type=route&id=${rwgpsRouteId}&sampleGraph=false&metricUnits=true&hideSurface=true`}
            className="w-full h-full"
            style={{ border: "none" }}
            title={`${name} route preview`}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}