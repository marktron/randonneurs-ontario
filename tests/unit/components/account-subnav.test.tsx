/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountSubnav } from '@/components/account/account-subnav'

describe('AccountSubnav', () => {
  it('renders My account, Settings, and Sign out controls with the right hrefs', () => {
    render(<AccountSubnav />)

    expect(screen.getByRole('link', { name: /my account/i })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/account/settings'
    )
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
