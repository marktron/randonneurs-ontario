import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadFonts } from './fonts'

let logoDataUri: string | null = null
let bgDataUri: string | null = null

async function getLogoDataUri(): Promise<string> {
  if (logoDataUri) return logoDataUri
  const logoPath = join(process.cwd(), 'public', 'logo.png')
  const buffer = await readFile(logoPath)
  logoDataUri = `data:image/png;base64,${buffer.toString('base64')}`
  return logoDataUri
}

async function getDefaultBgDataUri(): Promise<string> {
  if (bgDataUri) return bgDataUri
  const bgPath = join(process.cwd(), 'public', 'og-backgrounds', 'og-background.jpg')
  const buffer = await readFile(bgPath)
  bgDataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`
  return bgDataUri
}

/**
 * Resolve a /public path (e.g. "/toronto.jpg") to a base64 data URI.
 * Prefers the optimized version in /og-backgrounds/ if it exists,
 * otherwise falls back to the original.
 */
export async function resolvePublicImage(publicPath: string): Promise<string | undefined> {
  const filename = publicPath.replace(/^\//, '')
  const ext = filename.split('.').pop()?.toLowerCase()
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
  const publicDir = join(process.cwd(), 'public')

  // Try optimized version first, then fall back to original
  for (const dir of [join(publicDir, 'og-backgrounds'), publicDir]) {
    try {
      const buffer = await readFile(join(dir, filename))
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      continue
    }
  }
  return undefined
}

export const size = { width: 1200, height: 630 }

// Approximate hex equivalents of the site's oklch palette
const colors = {
  background: '#0A0A0A', // dark mode background
  foreground: '#FAFAFA', // dark mode foreground
  muted: '#E5E5E5', // dark mode muted-foreground
  primary: '#C10007', // red accent
}

export interface OgLayoutProps {
  title: string
  subtitle?: string
  badge?: string
  eyebrow?: string
  backgroundImageUrl?: string
}

export async function createOgImageResponse(props: OgLayoutProps) {
  const [fonts, logo, defaultBg] = await Promise.all([
    loadFonts(),
    getLogoDataUri(),
    getDefaultBgDataUri(),
  ])
  const bgUrl = props.backgroundImageUrl || defaultBg

  return new ImageResponse(<OgLayout {...props} backgroundImageUrl={bgUrl} logoSrc={logo} />, {
    ...size,
    fonts: [
      { name: 'Noto Sans', data: fonts.sans, style: 'normal', weight: 400 },
      { name: 'Noto Serif', data: fonts.serif, style: 'normal', weight: 700 },
    ],
  })
}

const textShadow = '0 2px 8px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)'

export function OgLayout({
  title,
  subtitle,
  badge,
  eyebrow,
  backgroundImageUrl,
  logoSrc,
}: OgLayoutProps & { logoSrc: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.background,
        position: 'relative',
      }}
    >
      {/* Background image with overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundImageUrl}
          alt=""
          // Explicit dimensions are required: when the background is a remote
          // image whose intrinsic size satori cannot determine, @vercel/og
          // otherwise throws "Image size cannot be determined" and the whole
          // OG route fails to render (JAVASCRIPT-NEXTJS-27).
          width={size.width}
          height={size.height}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'saturate(0.9) contrast(1.05) sepia(0.04)',
          }}
        />
        {/* Dark overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(10,10,10,0.5), rgba(10,10,10,0.7))',
          }}
        />
      </div>

      {/* Accent stripe at top */}
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: colors.primary,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: '60px 72px',
          position: 'relative',
        }}
      >
        {/* Eyebrow */}
        {eyebrow && (
          <div
            style={{
              fontFamily: 'Noto Sans',
              fontSize: 22,
              color: colors.muted,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 20,
              textShadow,
            }}
          >
            {eyebrow}
          </div>
        )}

        {/* Badge */}
        {badge && (
          <div
            style={{
              display: 'flex',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontFamily: 'Noto Sans',
                fontSize: 20,
                color: colors.foreground,
                backgroundColor: colors.primary,
                padding: '6px 20px',
                borderRadius: 4,
                letterSpacing: '0.04em',
              }}
            >
              {badge}
            </div>
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontFamily: 'Noto Serif',
            fontWeight: 700,
            fontSize: title.length > 40 ? 48 : title.length > 25 ? 56 : 64,
            color: colors.foreground,
            lineHeight: 1.15,
            maxWidth: '90%',
            textShadow,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontFamily: 'Noto Sans',
              fontSize: 28,
              color: colors.muted,
              marginTop: 20,
              lineHeight: 1.4,
              maxWidth: '85%',
              textShadow,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Bottom bar with logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 40px 40px',
          position: 'relative',
          marginTop: '-80',
        }}
      >
        {/* Dimensions match public/logo.png's intrinsic 160x109 — Satori scales
            to whatever is given here, so a mismatch stretches the logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={160} height={109} />
      </div>
    </div>
  )
}
