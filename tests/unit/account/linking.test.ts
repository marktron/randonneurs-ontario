import { describe, it, expect } from 'vitest'
import { decideLinkOutcome } from '@/lib/account/linking'

const c = (id: string) => ({ id, firstName: 'A', lastName: 'B' })

describe('decideLinkOutcome', () => {
  it('is unmatched with no candidates', () => {
    expect(decideLinkOutcome([])).toBe('unmatched')
  })
  it('links a single candidate', () => {
    expect(decideLinkOutcome([c('1')])).toBe('link')
  })
  it('asks the rider to choose when several riders share the email', () => {
    expect(decideLinkOutcome([c('1'), c('2')])).toBe('choose')
  })
})
