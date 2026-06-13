import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { OgLayout } from '@/lib/og/og-layout'

type ImgProps = { children?: ReactNode; src?: string; width?: unknown; height?: unknown }

function* walk(node: ReactNode): Generator<ReactElement<ImgProps>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child)
    return
  }
  if (!isValidElement(node)) return
  const el = node as ReactElement<ImgProps>
  yield el
  yield* walk(el.props?.children)
}

function findImgBySrc(root: ReactNode, src: string): ReactElement<ImgProps> | undefined {
  for (const el of walk(root)) {
    if (el.type === 'img' && el.props?.src === src) return el
  }
  return undefined
}

describe('OgLayout', () => {
  it('gives the background <img> explicit width and height', () => {
    // Regression for JAVASCRIPT-NEXTJS-27. The background image can be a remote
    // event image (Supabase Storage URL) whose intrinsic dimensions satori
    // cannot determine. Without explicit width/height props, @vercel/og throws
    // "Image size cannot be determined", which surfaces as "failed to pipe
    // response" and crashes the opengraph-image route. Explicit width/height
    // props take satori's fallback branch instead of throwing.
    const bg = 'https://example.supabase.co/storage/v1/object/public/images/events/broken.jpg'

    const tree = OgLayout({
      title: 'Bowle Buster 300km',
      backgroundImageUrl: bg,
      logoSrc: 'data:image/png;base64,AAAA',
    })

    const bgImg = findImgBySrc(tree, bg)
    expect(bgImg, 'background <img> should be present').toBeDefined()
    expect(Number.isFinite(Number(bgImg!.props.width))).toBe(true)
    expect(Number.isFinite(Number(bgImg!.props.height))).toBe(true)
  })
})
