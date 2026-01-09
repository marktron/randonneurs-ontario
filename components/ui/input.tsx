import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 rounded-4xl border px-3 py-1 text-base transition-colors file:h-7 file:text-sm file:font-medium focus-visible:ring-[3px] aria-invalid:ring-[3px] md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Date/time input styling for WebKit/Safari browsers
        "[&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-datetime-edit]:text-foreground [&::-webkit-date-and-time-value]:text-foreground [&::-webkit-datetime-edit-fields-wrapper]:text-foreground [&::-webkit-datetime-edit-text]:text-foreground [&::-webkit-datetime-edit-hour-field]:text-foreground [&::-webkit-datetime-edit-minute-field]:text-foreground [&::-webkit-datetime-edit-ampm-field]:text-foreground [color-scheme:light] dark:[color-scheme:dark]",
        // Safari specifically needs -webkit-text-fill-color
        type === "time" || type === "date" ? "[-webkit-text-fill-color:hsl(var(--foreground))]" : "",
        className
      )}
      {...props}
    />
  )
}

export { Input }
