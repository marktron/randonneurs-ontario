/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { AuthRedirectHandler } from '@/components/auth-redirect-handler'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}))

describe('AuthRedirectHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = ''
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('renders nothing visible', () => {
    const { container } = render(<AuthRedirectHandler />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does nothing when hash is empty', async () => {
    render(<AuthRedirectHandler />)

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  it('redirects to /admin/update-password preserving the hash when type=recovery', async () => {
    window.location.hash = '#access_token=abc123&refresh_token=xyz&type=recovery'

    render(<AuthRedirectHandler />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/admin/update-password#access_token=abc123&refresh_token=xyz&type=recovery'
      )
    })
  })

  it('does nothing when type is not recovery', async () => {
    window.location.hash = '#access_token=abc123&type=signup'

    render(<AuthRedirectHandler />)

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  it('does nothing when hash has no type parameter', async () => {
    window.location.hash = '#somevalue'

    render(<AuthRedirectHandler />)

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })
})
