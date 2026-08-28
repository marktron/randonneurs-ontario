import { describe, it, expect } from 'vitest'
import {
  detectLocationContext,
  detectPlatform,
  locationFixSteps,
  type LocationPlatform,
} from '@/lib/location-help'

// Real-world user agent strings.
const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iosEmbedded:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  it('detects iOS Safari', () => {
    expect(detectPlatform(UA.iosSafari)).toBe('ios-safari')
  })

  it('detects iOS Chrome via CriOS', () => {
    expect(detectPlatform(UA.iosChrome)).toBe('ios-chrome')
  })

  it('maps other iOS browsers to generic copy (their settings paths differ)', () => {
    expect(detectPlatform(UA.iosFirefox)).toBe('other')
  })

  it('detects an embedded iOS webview so the help can say to open Safari', () => {
    expect(detectPlatform(UA.iosEmbedded)).toBe('ios-embedded')
    expect(detectPlatform(UA.instagram)).toBe('ios-embedded')
  })

  it('detects Android', () => {
    expect(detectPlatform(UA.androidChrome)).toBe('android')
  })

  it('falls back to other for desktop and empty UAs', () => {
    expect(detectPlatform(UA.desktopChrome)).toBe('other')
    expect(detectPlatform('')).toBe('other')
  })
})

describe('detectLocationContext', () => {
  it('distinguishes normal browsers, standalone apps, and embedded iOS webviews', () => {
    expect(detectLocationContext(UA.iosSafari)).toBe('browser')
    expect(detectLocationContext(UA.iosSafari, true)).toBe('standalone')
    expect(detectLocationContext(UA.iosEmbedded)).toBe('embedded')
    expect(detectLocationContext(UA.instagram)).toBe('embedded')
  })

  it('does not label an unknown desktop user agent as embedded', () => {
    expect(detectLocationContext(UA.desktopChrome)).toBe('browser')
    expect(detectLocationContext('')).toBe('browser')
  })
})

describe('locationFixSteps', () => {
  const platforms: LocationPlatform[] = [
    'ios-safari',
    'ios-chrome',
    'ios-embedded',
    'android',
    'other',
  ]

  it.each(platforms)('%s has an intro and at least two steps', (platform) => {
    const help = locationFixSteps(platform)
    expect(help.intro.length).toBeGreaterThan(0)
    expect(help.steps.length).toBeGreaterThanOrEqual(2)
    for (const step of help.steps) expect(step.length).toBeGreaterThan(0)
  })

  it('iOS Safari steps go through OS Location Services, not browser menus', () => {
    const { steps } = locationFixSteps('ios-safari')
    expect(steps.join(' ')).toMatch(/Location Services/)
    expect(steps.join(' ')).toMatch(/Safari Websites/)
    expect(steps.join(' ')).toMatch(/Website Settings/)
  })

  it('iOS Chrome steps point at the Chrome app entry in Location Services', () => {
    const { steps } = locationFixSteps('ios-chrome')
    expect(steps.join(' ')).toMatch(/Location Services/)
    expect(steps.join(' ')).toMatch(/Chrome/)
  })

  it('embedded iOS help directs the rider to Safari', () => {
    const help = locationFixSteps('ios-embedded')
    expect(`${help.intro} ${help.steps.join(' ')}`).toMatch(/open.*Safari/i)
  })

  it('Android steps cover both Chrome site settings and the app permission', () => {
    const { steps } = locationFixSteps('android')
    expect(steps.join(' ')).toMatch(/Site settings/)
    expect(steps.join(' ')).toMatch(/Permissions/)
  })
})
