import { describe, it, expect } from 'vitest'
import { selectRegistrations } from '@/lib/control-cards-selection'

type Reg = { id: string; riders: { id: string } | null }

const regs: Reg[] = [
  { id: 'reg-a', riders: { id: 'rider-a' } },
  { id: 'reg-b', riders: { id: 'rider-b' } },
  { id: 'reg-c', riders: { id: 'rider-c' } },
]

describe('selectRegistrations', () => {
  it('returns all registrations when the param is undefined', () => {
    expect(selectRegistrations(regs, undefined)).toEqual(regs)
  })

  it('returns all registrations when the param is empty or whitespace', () => {
    expect(selectRegistrations(regs, '')).toEqual(regs)
    expect(selectRegistrations(regs, '   ')).toEqual(regs)
  })

  it('keeps only the selected riders, preserving original order', () => {
    const result = selectRegistrations(regs, 'rider-c,rider-a')
    expect(result.map((r) => r.id)).toEqual(['reg-a', 'reg-c'])
  })

  it('ignores unknown ids and trims whitespace around ids', () => {
    const result = selectRegistrations(regs, ' rider-b , rider-zzz ')
    expect(result.map((r) => r.id)).toEqual(['reg-b'])
  })

  it('drops registrations whose riders is null when filtering', () => {
    const withNull: Reg[] = [...regs, { id: 'reg-x', riders: null }]
    const result = selectRegistrations(withNull, 'rider-a')
    expect(result.map((r) => r.id)).toEqual(['reg-a'])
  })
})
