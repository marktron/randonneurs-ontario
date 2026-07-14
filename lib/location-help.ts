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

export type LocationPlatform = 'ios-safari' | 'ios-chrome' | 'android' | 'other'

export function detectPlatform(userAgent: string): LocationPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) {
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
