# Contributing Guide

Thank you for contributing to Randonneurs Ontario! This guide covers our development workflow, coding standards, and best practices.

## Development Workflow

### 1. Create a Branch

Create a feature branch from `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring

### 2. Make Your Changes

Follow the coding standards below. Run the linter frequently:

```bash
npm run lint
```

### 3. Test Locally

```bash
npm run dev
```

Test your changes in the browser. Check:
- Desktop and mobile views
- Form submissions
- Error states

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "Add registration confirmation email template"
```

Good commit messages:
- Start with a verb (Add, Fix, Update, Remove)
- Be specific about what changed
- Keep the first line under 72 characters

### 5. Push and Create Pull Request

```bash
git push -u origin feature/your-feature-name
```

Create a pull request on GitHub with:
- Clear description of changes
- Screenshots for UI changes
- Testing notes

## Coding Standards

### TypeScript

We use TypeScript for type safety. Follow these guidelines:

```typescript
// Use explicit types for function parameters and returns
async function getEventsByChapter(chapter: string): Promise<Event[]> {
  // ...
}

// Use interfaces for object shapes
interface EventDetails {
  id: string
  name: string
  date: string
}

// Use type imports
import type { Database } from '@/types/supabase'
```

### File Organization

```
app/
├── page.tsx           # Route component
├── layout.tsx         # Layout wrapper
├── loading.tsx        # Loading state
└── error.tsx          # Error boundary

components/
├── feature-name.tsx   # Component file
└── feature-name/      # Complex component folder
    ├── index.tsx
    ├── sub-component.tsx
    └── types.ts

lib/
├── data/              # Read operations
├── actions/           # Write operations (server actions)
└── utils.ts           # Utility functions
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `EventCard.tsx` |
| Utilities | camelCase | `formatDate.ts` |
| Types | PascalCase | `EventDetails` |
| Files | kebab-case | `event-card.tsx` |
| CSS classes | Tailwind utilities | `text-lg font-bold` |

### Component Structure

Follow this structure for React components:

```tsx
// 1. Imports
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Event } from '@/types'

// 2. Types (if not in separate file)
interface EventCardProps {
  event: Event
  onRegister?: () => void
}

// 3. Component
export function EventCard({ event, onRegister }: EventCardProps) {
  // Hooks first
  const [isLoading, setIsLoading] = useState(false)

  // Event handlers
  function handleClick() {
    setIsLoading(true)
    onRegister?.()
  }

  // Render
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{event.name}</h3>
      <Button onClick={handleClick} disabled={isLoading}>
        Register
      </Button>
    </div>
  )
}
```

### Server Components vs Client Components

```tsx
// Server Component (default) - no directive needed
export default async function EventsPage() {
  const events = await getEvents()  // Can fetch data directly
  return <EventList events={events} />
}

// Client Component - add directive at top
'use client'

import { useState } from 'react'

export function InteractiveForm() {
  const [value, setValue] = useState('')  // Can use hooks
  return <input value={value} onChange={e => setValue(e.target.value)} />
}
```

**When to use Client Components:**
- Interactive elements (forms, buttons with state)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)
- Event handlers that need immediate feedback

### Server Actions

```typescript
// lib/actions/example.ts
'use server'

import { revalidatePath } from 'next/cache'
import { handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export async function createSomething(data: FormData): Promise<ActionResult> {
  // 1. Validate input
  const name = data.get('name') as string
  if (!name?.trim()) {
    return { success: false, error: 'Name is required' }
  }

  // 2. Perform database operation
  const { error } = await getSupabaseAdmin()
    .from('things')
    .insert({ name })

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'createThing' },
      'Failed to create thing'
    )
  }

  // 3. Revalidate cache
  revalidatePath('/things')

  // 4. Return success
  return createActionResult()
}
```

### Styling with Tailwind

Use Tailwind utility classes. Follow the design system in `docs/style_guide.md`.

```tsx
// Good - using utility classes
<div className="rounded-lg border bg-card p-4 shadow-sm">
  <h3 className="text-lg font-semibold text-foreground">
    {title}
  </h3>
</div>

// Avoid - inline styles
<div style={{ padding: '16px', borderRadius: '8px' }}>
```

Use semantic color tokens from the theme:
- `bg-background` / `text-foreground` - Main content
- `bg-card` - Card backgrounds
- `bg-muted` / `text-muted-foreground` - Secondary content
- `bg-primary` / `text-primary-foreground` - Primary buttons
- `border` - Borders

### Database Queries

```typescript
// Use the appropriate client
import { getSupabase } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// For reads - use public client
import { handleDataError } from '@/lib/errors'

async function getEvents() {
  const { data, error } = await getSupabase()
    .from('events')
    .select('*')

  if (error) {
    return handleDataError(error, { operation: 'getEvents' }, [])
  }

  return data || []
}

// For writes - use admin client
async function createEvent(event: EventInsert) {
  const { data, error } = await getSupabaseAdmin()
    .from('events')
    .insert(event)
    .select()
    .single()

  if (error) throw error
  return data
}
```

## Common Tasks

### Adding a New Page

1. Create the route in `app/`:

```tsx
// app/my-page/page.tsx
export default async function MyPage() {
  return (
    <main className="container py-8">
      <h1 className="text-3xl font-bold">My Page</h1>
    </main>
  )
}
```

2. Add metadata for SEO:

```tsx
export const metadata = {
  title: 'My Page | Randonneurs Ontario',
  description: 'Description for search engines',
}
```

### Adding a UI Component

Use shadcn/ui for consistent components:

```bash
npx shadcn@latest add dialog
```

Then use it:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
```

### Adding a Database Migration

1. Create the migration:

```bash
npx supabase migration new add_new_column
```

2. Write the SQL in `supabase/migrations/TIMESTAMP_add_new_column.sql`:

```sql
ALTER TABLE events ADD COLUMN new_column TEXT;
```

3. Apply locally:

```bash
npx supabase db reset
```

4. Regenerate types:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

### Adding an Email Template

1. Add template in `lib/email/templates.ts`
2. Create send function in `lib/email/`
3. Call from server action

## Testing Checklist

Before submitting a PR:

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Tested on desktop viewport
- [ ] Tested on mobile viewport
- [ ] Tested form validation/error states
- [ ] Checked browser console for errors
- [ ] Updated types if schema changed

## Code Review Guidelines

When reviewing PRs, check for:

1. **Functionality** - Does it work as intended?
2. **Types** - Are types correct and specific enough?
3. **Error handling** - Are errors caught and handled?
4. **Security** - No exposed secrets or SQL injection?
5. **Performance** - Efficient queries and rendering?
6. **Style** - Follows coding standards?
7. **UX** - Accessible and responsive?

## Getting Help

- Read the documentation in `docs/`
- Look for similar patterns in the codebase
- Ask questions in pull request comments

## Documentation

This project uses documentation to help developers understand the codebase:

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview |
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Setup guide |
| [DATA_LAYER.md](./DATA_LAYER.md) | Database patterns |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Error handling patterns |
| [database-schema-plan.md](./database-schema-plan.md) | Schema design |
| [database-setup.md](./database-setup.md) | Database setup |
| [style_guide.md](./style_guide.md) | UI/UX guidelines |
