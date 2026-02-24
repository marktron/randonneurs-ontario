# Admin-Configurable Navigation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the site navigation fully data-driven via a JSON config file (`content/navigation.json`) managed through the admin tool.

**Architecture:** A JSON file in the repo stores the nav structure. A `getNavigation()` function reads and resolves templates/variables at build time. The Navbar renders from this data instead of hard-coded JSX. Admins edit the nav via a drag-and-drop editor that saves through the same GitHub API pattern used for CMS pages.

**Tech Stack:** Next.js 16 (App Router), TypeScript, shadcn/ui, Vitest, `@dnd-kit/sortable` for drag-and-drop

**Design doc:** `docs/plans/2026-02-23-navigation-config-design.md`

---

### Task 1: Create `content/navigation.json` seed file

This is the initial data file that exactly reproduces the current hard-coded nav.

**Files:**

- Create: `content/navigation.json`

**Step 1: Create the JSON file**

```json
{
  "items": [
    {
      "label": "About",
      "children": [
        { "label": "About Us", "href": "/about" },
        { "label": "What is Randonneuring?", "href": "/intro" },
        { "label": "Blog", "href": "https://blog.randonneursontario.ca", "external": true },
        { "label": "Club Policies", "href": "/policies" },
        { "label": "Mailing List", "href": "/mailing-list" },
        { "label": "Contact", "href": "/contact" }
      ]
    },
    {
      "label": "Routes",
      "children": [
        { "label": "{{chapter}}", "href": "/routes/{{chapter-slug}}", "template": "chapters" }
      ]
    },
    {
      "label": "Calendar",
      "children": [
        { "label": "All Chapters", "href": "/calendar" },
        { "label": "{{chapter}}", "href": "/calendar/{{chapter-slug}}", "template": "chapters" },
        { "separator": true },
        { "label": "Permanents", "href": "/calendar/permanents" },
        { "label": "Devil Week 2026", "href": "/devil-week-2026" }
      ]
    },
    {
      "label": "Results",
      "children": [
        { "label": "Chapters", "type": "heading" },
        {
          "label": "{{chapter}}",
          "href": "/results/{{season}}/{{chapter-slug}}",
          "template": "chapters"
        },
        { "separator": true },
        { "label": "Permanents", "href": "/results/{{season}}/permanent" },
        { "label": "Granite Anvil", "href": "/results/{{graniteAnvilYear}}/granite-anvil" },
        { "label": "Paris-Brest-Paris", "href": "/results/{{pbpYear}}/pbp" },
        { "separator": true },
        { "label": "Rider Directory", "href": "/riders" },
        { "label": "Records", "href": "/records" }
      ]
    },
    {
      "label": "Join the club",
      "href": "/membership",
      "style": "cta"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add content/navigation.json
git commit -m "feat: add navigation.json seed file"
```

---

### Task 2: Add `getNavigation()` to `lib/content.ts` with types

Read and resolve the JSON file, expanding chapter templates and replacing variable placeholders.

**Files:**

- Modify: `lib/content.ts`
- Create: `types/navigation.ts`
- Test: `tests/unit/lib/content-navigation.test.ts`

**Step 1: Create nav types**

Create `types/navigation.ts` with these types:

```typescript
/** Raw item shape as stored in navigation.json */
export interface NavItemRaw {
  label?: string
  href?: string
  external?: boolean
  style?: 'cta'
  type?: 'heading'
  separator?: boolean
  template?: 'chapters'
  children?: NavItemRaw[]
}

export interface NavigationConfigRaw {
  items: NavItemRaw[]
}

/** Resolved item shape after template expansion — ready for rendering */
export interface NavItem {
  label: string
  href?: string
  external?: boolean
  style?: 'cta'
  type?: 'heading'
  separator?: boolean
  children?: NavItem[]
}

export interface NavigationConfig {
  items: NavItem[]
}
```

**Step 2: Write failing tests**

Create `tests/unit/lib/content-navigation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import { getNavigation } from '@/lib/content'

vi.mock('fs')

const mockNav = {
  items: [
    {
      label: 'About',
      children: [
        { label: 'About Us', href: '/about' },
        { label: 'Blog', href: 'https://example.com', external: true },
      ],
    },
    {
      label: 'Routes',
      children: [{ label: '{{chapter}}', href: '/routes/{{chapter-slug}}', template: 'chapters' }],
    },
    {
      label: 'Results',
      children: [
        {
          label: '{{chapter}}',
          href: '/results/{{season}}/{{chapter-slug}}',
          template: 'chapters',
        },
        { separator: true },
        { label: 'PBP', href: '/results/{{pbpYear}}/pbp' },
        { label: 'Granite', href: '/results/{{graniteAnvilYear}}/granite-anvil' },
      ],
    },
    { label: 'Join', href: '/membership', style: 'cta' },
  ],
}

describe('getNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads and parses navigation.json', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()

    expect(result.items).toHaveLength(4)
    expect(result.items[0].label).toBe('About')
    expect(result.items[0].children).toHaveLength(2)
  })

  it('expands chapter templates into individual chapter links', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const routesChildren = result.items[1].children!

    expect(routesChildren).toHaveLength(4) // Huron, Ottawa, Simcoe-Muskoka, Toronto
    expect(routesChildren[0].label).toBe('Huron')
    expect(routesChildren[0].href).toBe('/routes/huron')
    expect(routesChildren[2].label).toBe('Simcoe-Muskoka')
    expect(routesChildren[2].href).toBe('/routes/simcoe-muskoka')
  })

  it('resolves {{season}} variable in hrefs', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    // First 4 are expanded chapter links with season
    expect(resultsChildren[0].href).toMatch(/^\/results\/\d{4}\/huron$/)
  })

  it('resolves {{pbpYear}} and {{graniteAnvilYear}} variables', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    const pbpItem = resultsChildren.find((c) => c.label === 'PBP')!
    expect(pbpItem.href).toMatch(/^\/results\/\d{4}\/pbp$/)

    const graniteItem = resultsChildren.find((c) => c.label === 'Granite')!
    expect(graniteItem.href).toMatch(/^\/results\/\d{4}\/granite-anvil$/)
  })

  it('preserves separators during template expansion', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    const separators = resultsChildren.filter((c) => c.separator)
    expect(separators).toHaveLength(1)
  })

  it('preserves external link flag', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const blog = result.items[0].children![1]

    expect(blog.external).toBe(true)
    expect(blog.href).toBe('https://example.com')
  })

  it('preserves CTA style', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    expect(result.items[3].style).toBe('cta')
  })

  it('returns fallback when navigation.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = getNavigation()

    expect(result.items).toHaveLength(1)
    expect(result.items[0].label).toBe('Home')
    expect(result.items[0].href).toBe('/')
  })

  it('returns fallback when navigation.json is malformed', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not json')
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()

    expect(result.items).toHaveLength(1)
    expect(result.items[0].label).toBe('Home')
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/content-navigation.test.ts`
Expected: FAIL — `getNavigation` is not exported from `@/lib/content`

**Step 4: Implement `getNavigation()` in `lib/content.ts`**

Add to the bottom of `lib/content.ts`:

```typescript
import type { NavigationConfig, NavigationConfigRaw, NavItem, NavItemRaw } from '@/types/navigation'

const navigationFile = path.join(process.cwd(), 'content/navigation.json')

const chapters = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

const FALLBACK_NAV: NavigationConfig = {
  items: [{ label: 'Home', href: '/' }],
}

function getTemplateVariables(): Record<string, string> {
  const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'
  const currentYear = new Date().getFullYear()
  const pbpYear = currentYear - ((currentYear - 3) % 4)
  const graniteAnvilYear = 2025

  return {
    season: currentSeason,
    pbpYear: String(pbpYear),
    graniteAnvilYear: String(graniteAnvilYear),
  }
}

function resolveHref(href: string, variables: Record<string, string>): string {
  return href.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

function expandItem(item: NavItemRaw, variables: Record<string, string>): NavItem[] {
  if (item.separator) return [{ label: '', separator: true }]
  if (item.type === 'heading') return [{ label: item.label ?? '', type: 'heading' }]

  if (item.template === 'chapters') {
    return chapters.map((chapter) => {
      const slug = chapter.toLowerCase().replace(/\s+/g, '-')
      const chapterVars = { ...variables, chapter, 'chapter-slug': slug }
      return {
        label: chapter,
        href: resolveHref(item.href ?? '', chapterVars),
      }
    })
  }

  const resolved: NavItem = { label: item.label ?? '' }
  if (item.href) resolved.href = resolveHref(item.href, variables)
  if (item.external) resolved.external = true
  if (item.style) resolved.style = item.style
  if (item.children) {
    resolved.children = item.children.flatMap((child) => expandItem(child, variables))
  }

  return [resolved]
}

/**
 * Read and resolve navigation config from content/navigation.json
 */
export function getNavigation(): NavigationConfig {
  try {
    if (!fs.existsSync(navigationFile)) return FALLBACK_NAV

    const raw = fs.readFileSync(navigationFile, 'utf8')
    const config: NavigationConfigRaw = JSON.parse(raw)
    const variables = getTemplateVariables()

    return {
      items: config.items.flatMap((item) => expandItem(item, variables)),
    }
  } catch {
    return FALLBACK_NAV
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/content-navigation.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add types/navigation.ts lib/content.ts tests/unit/lib/content-navigation.test.ts
git commit -m "feat: add getNavigation() with template expansion and tests"
```

---

### Task 3: Refactor Navbar to render from nav data

Replace the hard-coded navigation in `components/navbar.tsx` with data-driven rendering. The Navbar accepts resolved `NavItem[]` as a prop.

**Files:**

- Modify: `components/navbar.tsx`
- Modify: `components/page-shell.tsx`

**Step 1: Update `PageShell` to become a server component that reads nav data**

The current `PageShell` is a client component (`'use client'`) that dynamically imports `Navbar` with `ssr: false` to avoid Radix hydration issues. Refactor it:

1. Make `PageShell` a server component (remove `'use client'`)
2. Call `getNavigation()` inside `PageShell`
3. Pass resolved items to Navbar as a prop
4. Keep the dynamic `ssr: false` import for the Navbar, but pass items through

```typescript
// components/page-shell.tsx
import dynamic from 'next/dynamic'
import { Footer } from '@/components/footer'
import { getNavigation } from '@/lib/content'

const Navbar = dynamic(() => import('@/components/navbar').then((mod) => mod.Navbar), {
  ssr: false,
})

interface PageShellProps {
  children: React.ReactNode
}

export function PageShell({ children }: PageShellProps) {
  const { items } = getNavigation()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Navbar items={items} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
```

Note: `getNavigation()` is synchronous (uses `fs.readFileSync`), so it works in a server component without `async`. The `dynamic` import with `ssr: false` for Navbar is kept to avoid Radix hydration issues — the `items` prop is serializable JSON that passes through fine.

**Step 2: Refactor `Navbar` to accept items prop and render dynamically**

Replace the hard-coded JSX in `components/navbar.tsx` with a data-driven renderer. The component still has `'use client'` (it uses `useState` for the mobile sheet). It receives `NavItem[]` as a prop.

Key changes:

- Add `items` prop to `Navbar` function signature
- Remove all hard-coded menu item JSX
- Add a render function that maps each `NavItem` to the appropriate JSX:
  - Items with `children` → `NavigationMenuTrigger` + `NavigationMenuContent` (desktop) / `MobileNavSection` (mobile)
  - Items with `style: 'cta'` → red button link
  - Items without children and without style → plain link
  - Children: render `separator`, `heading`, `external`, and regular links with existing styles
- Remove the `chapters` constant, `currentSeason`, `mostRecentPbpYear`, `mostRecentGraniteAnvilYear` — these are now resolved in `getNavigation()`
- Keep `dropdownLinkStyles` and `MobileNavSection` helper

The `NavItem` type is imported from `@/types/navigation`.

Desktop rendering loop (inside `NavigationMenuList`):

```typescript
{items.map((item, i) => {
  if (item.style === 'cta') {
    return (
      <NavigationMenuItem key={i}>
        <Link href={item.href!} className="inline-flex items-center rounded-full bg-red-600 ml-3 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700">
          {item.label}
        </Link>
      </NavigationMenuItem>
    )
  }
  if (item.children) {
    return (
      <NavigationMenuItem key={i}>
        <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
          {item.label}
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-52 gap-1 p-2">
            {item.children.map((child, j) => (
              <NavChildItem key={j} item={child} />
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    )
  }
  return null
})}
```

Create a `NavChildItem` helper for rendering children (used by both desktop and mobile):

```typescript
function NavChildItem({ item }: { item: NavItem }) {
  if (item.separator) return <li className="border-t border-border my-1" />
  if (item.type === 'heading') {
    return <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</li>
  }
  if (item.external) {
    return (
      <li>
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={dropdownLinkStyles}>
          {item.label}
        </a>
      </li>
    )
  }
  return (
    <li>
      <Link href={item.href!} className={dropdownLinkStyles}>{item.label}</Link>
    </li>
  )
}
```

Apply the same pattern for the mobile nav section, using the `onClick={() => setOpen(false)}` handler on each link.

**Step 3: Manually verify the site renders identically**

Run: `npm run dev`

- Check desktop nav: all 5 top-level items render with correct dropdowns
- Check mobile nav: all collapsible sections work
- Check external links open in new tab
- Check CTA button renders with red style
- Check chapter links expand correctly
- Check Results section has headings and separators

**Step 4: Commit**

```bash
git add components/navbar.tsx components/page-shell.tsx
git commit -m "feat: render navbar from navigation.json data"
```

---

### Task 4: Create `saveNavigation()` server action

Mirrors the `savePage()` pattern — saves `content/navigation.json` via GitHub API in production, local filesystem in dev.

**Files:**

- Create: `lib/actions/navigation.ts`
- Test: `tests/integration/actions/navigation.test.ts`

**Step 1: Write failing tests**

Create `tests/integration/actions/navigation.test.ts`, following the exact pattern from `tests/integration/actions/pages.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const mockWriteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
}))

import { saveNavigation } from '@/lib/actions/navigation'

describe('saveNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
  })

  describe('validation', () => {
    it('returns error when items array is empty', async () => {
      const result = await saveNavigation({ items: [] })
      expect(result.success).toBe(false)
      expect(result.error).toContain('at least one')
    })

    it('returns error when a top-level item has no label', async () => {
      const result = await saveNavigation({
        items: [{ label: '', children: [{ label: 'Link', href: '/foo' }] }],
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('label')
    })

    it('returns error when a child link has no href', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ label: 'Link' }] }],
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('href')
    })

    it('allows separator children without href or label', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ separator: true }] }],
      })
      expect(result.success).toBe(true)
    })

    it('allows heading children without href', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ label: 'Section', type: 'heading' }] }],
      })
      expect(result.success).toBe(true)
    })

    it('allows template children without resolved href', async () => {
      const result = await saveNavigation({
        items: [
          {
            label: 'Routes',
            children: [
              { label: '{{chapter}}', href: '/routes/{{chapter-slug}}', template: 'chapters' },
            ],
          },
        ],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('local file saving', () => {
    it('saves navigation.json locally in dev mode', async () => {
      const nav = {
        items: [{ label: 'About', children: [{ label: 'About Us', href: '/about' }] }],
      }

      const result = await saveNavigation(nav)

      expect(result.success).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledTimes(1)

      const [filePath, content] = mockWriteFile.mock.calls[0]
      expect(filePath).toContain('content/navigation.json')

      const saved = JSON.parse(content)
      expect(saved.items[0].label).toBe('About')
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/actions/navigation.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `saveNavigation()` in `lib/actions/navigation.ts`**

Follow the exact same structure as `lib/actions/pages.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, createActionResult, logError } from '@/lib/errors'
import type { NavigationConfigRaw, NavItemRaw } from '@/types/navigation'

interface SaveNavigationResult {
  success: boolean
  error?: string
}

function validateNavigation(config: NavigationConfigRaw): string | null {
  if (!config.items || config.items.length === 0) {
    return 'Navigation must have at least one item'
  }

  for (const item of config.items) {
    if (!item.label?.trim()) {
      return 'Every top-level item must have a label'
    }

    if (item.children) {
      for (const child of item.children) {
        if (child.separator || child.type === 'heading' || child.template) continue
        if (!child.label?.trim()) return 'Every link must have a label'
        if (!child.href?.trim()) return 'Every link must have an href'
      }
    }
  }

  return null
}

export async function saveNavigation(config: NavigationConfigRaw): Promise<SaveNavigationResult> {
  const admin = await requireAdmin()

  const validationError = validateNavigation(config)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const fileContent = JSON.stringify(config, null, 2) + '\n'

  if (process.env.NODE_ENV === 'development') {
    return saveLocalFile(fileContent, admin.id)
  }

  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO

  if (!githubToken || !githubRepo) {
    return { success: false, error: 'GitHub integration not configured' }
  }

  try {
    const filePath = 'content/navigation.json'
    const [owner, repo] = githubRepo.split('/')

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    let sha: string | undefined
    if (getResponse.ok) {
      const data = await getResponse.json()
      sha = data.sha
    }

    const putResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Update navigation',
          content: Buffer.from(fileContent).toString('base64'),
          sha,
        }),
      }
    )

    if (!putResponse.ok) {
      const error = await putResponse.json()
      logError(error, { operation: 'saveNavigation.github' })
      return { success: false, error: 'Failed to save to GitHub' }
    }

    revalidatePath('/', 'layout')

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'navigation',
      entityId: 'navigation',
      description: 'Updated site navigation',
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'saveNavigation' },
      'An error occurred while saving'
    )
  }
}

async function saveLocalFile(content: string, adminId: string): Promise<SaveNavigationResult> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    const filePath = path.join(process.cwd(), 'content/navigation.json')
    await fs.writeFile(filePath, content, 'utf-8')

    revalidatePath('/', 'layout')

    await logAuditEvent({
      adminId,
      action: 'update',
      entityType: 'navigation',
      entityId: 'navigation',
      description: 'Updated site navigation',
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'saveNavigation.local' },
      'Failed to save file locally'
    )
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/actions/navigation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/actions/navigation.ts tests/integration/actions/navigation.test.ts
git commit -m "feat: add saveNavigation() server action with validation and tests"
```

---

### Task 5: Add `getNavigationRaw()` for the admin editor

The admin UI needs the raw JSON (with templates unexpanded) so admins can edit the structure. Add a simple reader alongside `getNavigation()`.

**Files:**

- Modify: `lib/content.ts`

**Step 1: Add `getNavigationRaw()` to `lib/content.ts`**

```typescript
/**
 * Read raw navigation config (unexpanded, for admin editing)
 */
export function getNavigationRaw(): NavigationConfigRaw | null {
  try {
    if (!fs.existsSync(navigationFile)) return null
    const raw = fs.readFileSync(navigationFile, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}
```

**Step 2: Commit**

```bash
git add lib/content.ts
git commit -m "feat: add getNavigationRaw() for admin editor"
```

---

### Task 6: Add Navigation to admin sidebar

Add a "Navigation" link to the admin sidebar, visible to full admins.

**Files:**

- Modify: `components/admin/sidebar.tsx`

**Step 1: Add Navigation to `managementNavItems`**

In `components/admin/sidebar.tsx`, add to the `managementNavItems` array (after the Pages entry):

```typescript
import { Navigation } from 'lucide-react'

// Add to managementNavItems, after the Pages entry:
{
  title: 'Navigation',
  href: '/admin/navigation',
  icon: Navigation,
  testId: 'nav-navigation',
  requiresSuperAdmin: false,
},
```

**Step 2: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat: add Navigation link to admin sidebar"
```

---

### Task 7: Build the admin navigation editor page

The main admin UI for managing navigation. A sortable list of top-level items, each expandable to show/edit children.

**Files:**

- Create: `app/admin/navigation/page.tsx`
- Create: `components/admin/navigation-editor.tsx`

**Step 1: Install dnd-kit for drag-and-drop sorting**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Check if `@dnd-kit` is already in `package.json` first. If it is, skip installation.

**Step 2: Create the admin page**

Create `app/admin/navigation/page.tsx`:

```typescript
import { getNavigationRaw } from '@/lib/content'
import { NavigationEditor } from '@/components/admin/navigation-editor'

export const metadata = { title: 'Navigation' }

export default function NavigationPage() {
  const config = getNavigationRaw()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Navigation</h1>
        <p className="text-muted-foreground">
          Manage the site navigation menu. Changes trigger a new deployment.
        </p>
      </div>
      <NavigationEditor initialConfig={config} />
    </div>
  )
}
```

**Step 3: Create the navigation editor component**

Create `components/admin/navigation-editor.tsx`. This is the largest component. Key features:

- **State**: `useState` holding the `NavigationConfigRaw` items array
- **Top-level list**: Sortable via `@dnd-kit/sortable` with `SortableContext` and `verticalListSortingStrategy`
- **Each top-level item**: An accordion-style expandable card showing label, child count, drag handle, delete button
- **Expanded view**: Edit fields (label, optional href, style dropdown), plus a sortable list of children
- **Child items**: Each shows label + href (or "Separator" / "Heading" / "Chapter Template" badge), with edit/delete
- **Add item**: Button at bottom of top-level list, adds a new dropdown item
- **Add child**: Button at bottom of each expanded item's children list, opens inline form
- **Child form fields**: Label, URL (with a helper that lists existing CMS pages), type selector (Link / External / Separator / Heading / Chapter Template)
- **Save button**: Calls `saveNavigation()` server action, shows toast

Follow the patterns from `components/admin/page-editor.tsx`:

- `'use client'` directive
- Use `toast` from `sonner` for success/error
- Use `Loader2` spinner during save
- Use shadcn `Button`, `Input`, `Label`, `Select` components
- Use `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` for accordion
- Use `GripVertical` icon from lucide for drag handles

For the CMS page list helper in the URL field, accept `pages` as a prop from the server page component (call `getAllPages()` there and pass it down).

Update `app/admin/navigation/page.tsx` to also pass pages:

```typescript
import { getNavigationRaw, getAllPages } from '@/lib/content'

export default function NavigationPage() {
  const config = getNavigationRaw()
  const pages = getAllPages()

  return (
    // ...
    <NavigationEditor initialConfig={config} pages={pages} />
  )
}
```

The editor should be functional but doesn't need to be pixel-perfect on the first pass. Focus on correctness: the saved JSON must match the expected schema exactly.

**Step 4: Manual testing**

Run: `npm run dev`

- Navigate to `/admin/navigation`
- Verify the current nav structure loads correctly
- Reorder a top-level item, save, refresh — verify order persisted
- Add a new child link to a dropdown, save — verify it appears in `content/navigation.json`
- Delete a child link, save — verify removal
- Check that the site nav updates after save + page refresh

**Step 5: Commit**

```bash
git add app/admin/navigation/page.tsx components/admin/navigation-editor.tsx package.json package-lock.json
git commit -m "feat: add admin navigation editor with drag-and-drop"
```

---

### Task 8: Update documentation

**Files:**

- Modify: `docs/ARCHITECTURE.md`

**Step 1: Add navigation section to ARCHITECTURE.md**

Add a section describing the navigation data flow:

- `content/navigation.json` stores the raw nav structure
- `getNavigation()` reads and resolves templates/variables at build time
- `Navbar` component renders from resolved data
- Admin editor at `/admin/navigation` saves via `saveNavigation()` server action
- Changes commit to repo via GitHub API and trigger Vercel rebuild

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add navigation architecture documentation"
```

---

### Task 9: Final verification

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, including new navigation tests

**Step 2: Run the dev server and verify end-to-end**

Run: `npm run dev`

- Desktop nav renders identically to before
- Mobile nav renders identically to before
- Admin navigation editor loads at `/admin/navigation`
- Making a change and saving updates `content/navigation.json`
- The site nav reflects the change after refresh

**Step 3: Run the build to verify no build errors**

Run: `npm run build`
Expected: Build succeeds with no errors
