/**
 * @vitest-environment happy-dom
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Stand-in for the Cloudflare widget. Each mount gets its own id, so the label
// reveals whether the widget remounted and the token it issues is distinct.
let mountCount = 0
vi.mock('@/components/account/turnstile-field', () => ({
  TurnstileField: ({ onToken }: { onToken: (token: string | null) => void }) => {
    const id = React.useMemo(() => ++mountCount, [])
    return (
      <button type="button" data-testid="captcha" onClick={() => onToken(`tok-${id}`)}>
        solve {id}
      </button>
    )
  },
}))

import { useTurnstile } from '@/hooks/use-turnstile'

function Harness() {
  const captcha = useTurnstile()
  const [taken, setTaken] = React.useState('none')
  return (
    <div>
      {captcha.widget}
      <div data-testid="token">{captcha.token ?? 'null'}</div>
      <div data-testid="taken">{taken}</div>
      <button
        type="button"
        data-testid="take"
        onClick={() => setTaken(captcha.takeToken() ?? 'undefined')}
      >
        take
      </button>
      <button type="button" data-testid="reset" onClick={captcha.reset}>
        reset
      </button>
    </div>
  )
}

describe('useTurnstile', () => {
  beforeEach(() => {
    mountCount = 0
  })

  it('exposes the token the widget issues', () => {
    render(<Harness />)
    expect(screen.getByTestId('token')).toHaveTextContent('null')
    fireEvent.click(screen.getByTestId('captcha'))
    expect(screen.getByTestId('token')).toHaveTextContent('tok-1')
  })

  it('takeToken returns the token, clears it, and remounts the widget', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('captcha'))
    expect(screen.getByTestId('captcha')).toHaveTextContent('solve 1')

    fireEvent.click(screen.getByTestId('take'))

    // The caller gets the token it is about to spend...
    expect(screen.getByTestId('taken')).toHaveTextContent('tok-1')
    // ...and the hook no longer holds it, so it can't be submitted twice.
    expect(screen.getByTestId('token')).toHaveTextContent('null')
    // A fresh challenge is mounted for the next attempt.
    expect(screen.getByTestId('captcha')).toHaveTextContent('solve 2')

    fireEvent.click(screen.getByTestId('captcha'))
    expect(screen.getByTestId('token')).toHaveTextContent('tok-2')
  })

  it('takeToken returns undefined when no challenge has been solved', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('take'))
    expect(screen.getByTestId('taken')).toHaveTextContent('undefined')
  })

  it('reset clears the token and remounts the widget', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('captcha'))
    expect(screen.getByTestId('token')).toHaveTextContent('tok-1')

    fireEvent.click(screen.getByTestId('reset'))

    expect(screen.getByTestId('token')).toHaveTextContent('null')
    expect(screen.getByTestId('captcha')).toHaveTextContent('solve 2')
  })
})
