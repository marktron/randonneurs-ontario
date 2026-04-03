import { describe, it, expect } from 'vitest'
import { GET as getLlmsTxt } from '@/app/llms.txt/route'
import { GET as getLlmsFullTxt } from '@/app/llms-full.txt/route'

describe('GET /llms.txt', () => {
  it('returns 200 with text/plain content type', () => {
    const response = getLlmsTxt()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
  })

  it('starts with the site name as H1', async () => {
    const response = getLlmsTxt()
    const body = await response.text()
    expect(body.startsWith('# Randonneurs Ontario')).toBe(true)
  })

  it('contains expected sections', async () => {
    const response = getLlmsTxt()
    const body = await response.text()
    expect(body).toContain('## Core Pages')
    expect(body).toContain('## Live Data')
    expect(body).toContain('## Optional')
  })

  it('contains links to key pages', async () => {
    const response = getLlmsTxt()
    const body = await response.text()
    expect(body).toContain('/about')
    expect(body).toContain('/intro')
    expect(body).toContain('/your-first-brevet')
    expect(body).toContain('/rules')
    expect(body).toContain('/membership')
    expect(body).toContain('/calendar')
  })

  it('uses the configured base URL', async () => {
    const response = getLlmsTxt()
    const body = await response.text()
    expect(body).toContain('https://randonneursontario.ca')
  })
})

describe('GET /llms-full.txt', () => {
  it('returns 200 with text/plain content type', () => {
    const response = getLlmsFullTxt()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
  })

  it('starts with the site name as H1', async () => {
    const response = getLlmsFullTxt()
    const body = await response.text()
    expect(body.startsWith('# Randonneurs Ontario')).toBe(true)
  })

  it('inlines markdown content from content pages', async () => {
    const response = getLlmsFullTxt()
    const body = await response.text()
    // Content from about.md
    expect(body).toContain('Audax Club Parisien')
    // Content from your-first-brevet.md
    expect(body).toContain('Start easy')
    // Content from rules.md
    expect(body).toContain('200km: 13.5 hours')
    // Content from origins.md
    expect(body).toContain('Martin Heath')
  })

  it('contains additional pages section with links', async () => {
    const response = getLlmsFullTxt()
    const body = await response.text()
    expect(body).toContain('## Additional Pages')
    expect(body).toContain('/intro')
    expect(body).toContain('/membership')
    expect(body).toContain('/calendar')
  })
})
