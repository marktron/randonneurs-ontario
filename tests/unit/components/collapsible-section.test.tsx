/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollapsibleSection } from '@/components/admin/collapsible-section'

/**
 * Folding is expressed with Tailwind's `hidden sm:block` idiom rather than by
 * unmounting, so these assertions read the class list — the same approach the
 * other mobile-layout tests in this suite use. happy-dom applies no Tailwind
 * CSS, so nothing is genuinely hidden here; the classes are the behaviour.
 */
function renderSection(props: Partial<Parameters<typeof CollapsibleSection>[0]> = {}) {
  return render(
    <CollapsibleSection
      title="Controls"
      description="How controls work."
      summary="12 controls"
      actions={<button type="button">Save controls</button>}
      {...props}
    >
      <input aria-label="Control name" defaultValue="Oakville" />
    </CollapsibleSection>
  )
}

function body(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('section > div:last-of-type')!
}

describe('CollapsibleSection', () => {
  it('renders expanded by default with nothing folded away', () => {
    const { container } = renderSection()

    const toggle = screen.getByRole('button', { name: 'Hide Controls' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Controls', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('How controls work.').className).not.toContain('hidden')
    expect(body(container).className).not.toContain('hidden')
  })

  it('folds the description, actions, and body when it starts collapsed', () => {
    const { container } = renderSection({ defaultCollapsed: true })

    const toggle = screen.getByRole('button', { name: 'Show Controls' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const description = screen.getByText('How controls work.')
    expect(description.className).toContain('hidden')
    expect(description.className).toContain('sm:block')

    const actions = screen.getByRole('button', { name: 'Save controls' }).parentElement!
    expect(actions.className).toContain('hidden')
    expect(actions.className).toContain('sm:flex')

    expect(body(container).className).toContain('hidden')
    expect(body(container).className).toContain('sm:block')
  })

  it('keeps the section readable while folded by showing the summary', async () => {
    renderSection({ defaultCollapsed: true })

    expect(screen.getByText('12 controls')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show Controls' }))

    // Redundant once the content is on screen.
    expect(screen.queryByText('12 controls')).not.toBeInTheDocument()
  })

  it('unfolds and refolds on toggle', async () => {
    const { container } = renderSection({ defaultCollapsed: true })

    await userEvent.click(screen.getByRole('button', { name: 'Show Controls' }))
    expect(body(container).className).not.toContain('hidden')

    await userEvent.click(screen.getByRole('button', { name: 'Hide Controls' }))
    expect(body(container).className).toContain('hidden')
  })

  it('keeps folded content mounted so unsaved edits survive a collapse', async () => {
    renderSection()

    const input = screen.getByLabelText('Control name') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'Orangeville')

    await userEvent.click(screen.getByRole('button', { name: 'Hide Controls' }))

    expect((screen.getByLabelText('Control name') as HTMLInputElement).value).toBe('Orangeville')
  })

  it('offers the toggle on mobile only, with a 44px touch target', () => {
    renderSection()

    const toggle = screen.getByRole('button', { name: 'Hide Controls' })
    // The body is unconditionally visible from `sm` up, so a toggle there
    // would be a control that does nothing.
    expect(toggle.className).toContain('sm:hidden')
    expect(toggle.className).toContain('min-h-11')
  })

  it('points aria-controls at every region it folds', () => {
    const { container } = renderSection({ defaultCollapsed: true })

    const toggle = screen.getByRole('button', { name: 'Show Controls' })
    const controlled = toggle.getAttribute('aria-controls')!.split(' ')

    expect(controlled).toHaveLength(3)
    for (const id of controlled) {
      expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull()
    }
  })
})
