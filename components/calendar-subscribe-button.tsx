'use client'

import { useState } from 'react'
import { CalendarPlus, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CalendarSubscribeButtonProps {
  chapter: string
  chapterName: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
}

export function CalendarSubscribeButton({
  chapter,
  chapterName,
  variant = 'outline',
  size = 'default',
}: CalendarSubscribeButtonProps) {
  const [copied, setCopied] = useState(false)

  // Build the calendar feed URL
  const feedPath = `/api/calendar/${chapter}.ics`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneurs.to'
  const feedUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${feedPath}`
    : `${siteUrl}${feedPath}`

  // webcal:// protocol for native calendar apps
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:')

  // Google Calendar subscription URL
  const googleCalendarUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size}>
          <CalendarPlus className="h-4 w-4 mr-2" />
          Subscribe
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" fill="none" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={webcalUrl} className="cursor-pointer">
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Apple Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-green-600" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          {copied ? 'Copied!' : 'Copy Link'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
