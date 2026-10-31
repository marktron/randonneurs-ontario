/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navbar } from '@/components/navbar'
import type { NavItem } from '@/types/navigation'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const items: NavItem[] = [
  {
    label: 'About',
    children: [{ label: 'About Us', href: '/about' }],
  },
  // A top-level item with an href and no children. The admin editor tells
  // users such an item "will render as a direct link".
  { label: 'News', href: '/news' },
  { label: 'Join the club', href: '/membership', style: 'cta' },
]

function desktopNav() {
  // The desktop NavigationMenu is always mounted (hidden below lg via CSS).
  return screen.getAllByRole('navigation')[0]
}

async function openMobileMenu() {
  await userEvent.click(screen.getByRole('button', { name: /toggle menu/i }))
  return screen.findByRole('dialog')
}

describe('Navbar', () => {
  it('renders a top-level direct link in the desktop nav', () => {
    render(<Navbar items={items} />)

    const link = within(desktopNav()).getByRole('link', { name: 'News' })
    expect(link).toHaveAttribute('href', '/news')
  })

  it('renders a top-level direct link in the mobile menu', async () => {
    render(<Navbar items={items} />)

    const sheet = await openMobileMenu()
    const link = within(sheet).getByRole('link', { name: 'News' })
    expect(link).toHaveAttribute('href', '/news')
  })

  it('still renders dropdown sections and the CTA in the mobile menu', async () => {
    render(<Navbar items={items} />)

    const sheet = await openMobileMenu()
    expect(within(sheet).getByRole('button', { name: 'About' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Join the club' })).toHaveAttribute(
      'href',
      '/membership'
    )
  })
})
