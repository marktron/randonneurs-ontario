/**
 * Platform-specific instructions for un-blocking browser geolocation.
 *
 * Riders sometimes have location set to "Never" for their browser at the
 * OS level (iOS Settings -> Privacy & Security -> Location Services). The
 * browser then never shows a permission prompt and getCurrentPosition
 * fails immediately with PERMISSION_DENIED. The fix lives in a different
 * place on each platform, so the card detects the platform and shows the
 * matching steps (see docs/digital-brevet-card.md).
 */

import type { LocationContext } from '@/lib/location-diagnostics'

export type LocationPlatform = 'ios-safari' | 'ios-chrome' | 'ios-embedded' | 'android' | 'other'

const IOS_DEVICE = /iPhone|iPad|iPod/
const IOS_EMBEDDED_APP = /FBAN|FBAV|Instagram|GSA\/|Gmail|Line\/|MicroMessenger|LinkedInApp/i
const IOS_BROWSER = /(?:Version\/[^ ]+.*Safari\/|CriOS|FxiOS|EdgiOS|OPiOS)/i

/**
 * Classify only a bounded context label for diagnostics. The user-agent is
 * inspected locally and is never returned or persisted.
 */
export function detectLocationContext(userAgent: string, isStandalone = false): LocationContext {
  if (isStandalone) return 'standalone'
  if (
    IOS_DEVICE.test(userAgent) &&
    (IOS_EMBEDDED_APP.test(userAgent) ||
      (/AppleWebKit/i.test(userAgent) && !IOS_BROWSER.test(userAgent)))
  ) {
    return 'embedded'
  }
  return 'browser'
}

export function detectPlatform(userAgent: string, isStandalone = false): LocationPlatform {
  if (IOS_DEVICE.test(userAgent)) {
    if (detectLocationContext(userAgent, isStandalone) === 'embedded') return 'ios-embedded'
    if (/CriOS/.test(userAgent)) return 'ios-chrome'
    // Firefox (FxiOS), Edge (EdgiOS), etc. have their own settings paths;
    // the generic copy is safer than pointing at "Safari Websites".
    if (/FxiOS|EdgiOS|OPiOS/i.test(userAgent)) return 'other'
    return 'ios-safari'
  }
  if (/Android/.test(userAgent)) return 'android'
  return 'other'
}

export interface LocationFixHelp {
  intro: string
  steps: string[]
}

const FIX_STEPS: Record<LocationPlatform, LocationFixHelp> = {
  'ios-safari': {
    intro: 'Your iPhone is blocking location for Safari. It takes under a minute to fix:',
    steps: [
      'Open the Settings app and go to Privacy & Security, then Location Services.',
      'Make sure Location Services (at the top) is turned on.',
      'Scroll down to Safari Websites and choose "While Using the App".',
      "If those are already on, tap the aA button in Safari's address bar, choose Website Settings, and set Location to Ask or Allow.",
      'Come back to this page and try again.',
    ],
  },
  'ios-chrome': {
    intro: 'Your iPhone is blocking location for Chrome. It takes under a minute to fix:',
    steps: [
      'Open the Settings app and go to Privacy & Security, then Location Services.',
      'Make sure Location Services (at the top) is turned on.',
      'Scroll down to Chrome and choose "While Using the App".',
      'Come back to this page and try again.',
    ],
  },
  'ios-embedded': {
    intro:
      'This card is open inside another app, where iPhone location may not work. Open it in Safari:',
    steps: [
      'Use the Share button or the app menu and choose "Open in Safari". If that option is missing, copy this page link and paste it into Safari.',
      'In Safari, return to this card and try again.',
      'If Safari asks for location, choose Allow While Using App and turn on Precise Location.',
    ],
  },
  android: {
    intro: 'Your phone is blocking location for the browser. To fix it:',
    steps: [
      'In Chrome, tap the three-dot menu, then Settings, then Site settings, then Location — make sure it is on and this site is not blocked.',
      'In your phone Settings, go to Apps, then Chrome, then Permissions, then Location and choose "Allow only while using the app".',
      'Make sure location is turned on for the phone itself (check Quick Settings).',
      'Come back to this page and try again.',
    ],
  },
  other: {
    intro: 'Your browser is blocking location for this site. To fix it:',
    steps: [
      'Open your browser settings and find Site settings (or Privacy), then Location.',
      'Allow location for this site.',
      'Come back to this page and try again.',
    ],
  },
}

export function locationFixSteps(platform: LocationPlatform): LocationFixHelp {
  return FIX_STEPS[platform]
}
