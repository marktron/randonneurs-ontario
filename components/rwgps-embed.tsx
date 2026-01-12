"use client";

import { useState } from "react";

interface RwgpsEmbedProps {
  routeId: string | number;
  title?: string;
}

export function RwgpsEmbed({ routeId, title = "Route Map" }: RwgpsEmbedProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative" style={{ height: "500px" }}>
      {/* Loading placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-lg flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <svg
              className="mx-auto h-12 w-12 mb-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            <p className="text-sm">Loading route map...</p>
          </div>
        </div>
      )}

      {/* Actual iframe */}
      <iframe
        src={`https://ridewithgps.com/embeds?type=route&id=${routeId}&sampleGraph=true&metricUnits=true`}
        style={{
          width: "1px",
          minWidth: "100%",
          height: "500px",
          border: "none",
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.3s ease-in-out",
        }}
        scrolling="no"
        title={title}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}
