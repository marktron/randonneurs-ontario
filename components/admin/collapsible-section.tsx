'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  /** Section heading. Also names the toggle ("Show Controls"/"Hide Controls"). */
  title: string
  /** Sub-heading copy. Folds away with the body. */
  description?: ReactNode
  /**
   * Short status shown beside the heading while folded — e.g. "12 controls" —
   * so a collapsed section still says what is inside it.
   */
  summary?: ReactNode
  /** Buttons that sit to the right of the heading from `sm` up. */
  actions?: ReactNode
  /**
   * Start folded. Folding is a mobile affordance only, so this changes
   * nothing at `sm` and above.
   */
  defaultCollapsed?: boolean
  className?: string
  children: ReactNode
}

/**
 * Section wrapper for admin screens that stack several data tables. On a
 * phone those tables "cardify" (one stacked card per row, per §7 of the style
 * guide), so a single table can run thousands of pixels tall and bury every
 * section below it. Folding a section puts the next heading one swipe away.
 *
 * Folding is a mobile affordance: from `sm` up the body is always shown and
 * the toggle is gone, because at that width the tables are compact enough to
 * scroll past.
 *
 * The fold is CSS (`hidden sm:block`), not conditional rendering, on purpose:
 * a collapsed section renders identically on the server and the client (no
 * hydration flash of an expanded section on a phone), and inputs inside a
 * folded section stay mounted, so unsaved edits survive a collapse.
 */
export function CollapsibleSection({
  title,
  description,
  summary,
  actions,
  defaultCollapsed = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const id = useId()
  const descriptionId = `${id}-description`
  const actionsId = `${id}-actions`
  const bodyId = `${id}-body`
  const controlledIds = [description ? descriptionId : null, actions ? actionsId : null, bodyId]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-controls={controlledIds}
              aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
              // -mr-2 keeps the 44px touch target flush with the content edge
              className="-mr-2 ml-auto flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground sm:hidden"
            >
              {collapsed && summary}
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none',
                  collapsed && '-rotate-90'
                )}
              />
            </button>
          </div>
          {description && (
            <p
              id={descriptionId}
              className={cn('text-sm text-muted-foreground', collapsed && 'hidden sm:block')}
            >
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div
            id={actionsId}
            className={cn('flex-wrap gap-2', collapsed ? 'hidden sm:flex' : 'flex')}
          >
            {actions}
          </div>
        )}
      </div>

      <div id={bodyId} className={cn(collapsed && 'hidden sm:block')}>
        {children}
      </div>
    </section>
  )
}
