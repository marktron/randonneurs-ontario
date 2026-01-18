# Testing Guide

This guide covers the testing strategy, patterns, and conventions used in the Randonneurs Ontario project.

## Overview

The project uses a three-tier testing approach:

1. **Unit Tests** - Test individual functions and utilities in isolation
2. **Integration Tests** - Test server actions, data fetching, and API routes with mocked dependencies
3. **E2E Tests** - Test complete user journeys using Playwright

## Test Structure

```
tests/
├── unit/              # Unit tests for utilities and components
│   ├── components/   # React component tests
│   ├── lib/          # Utility function tests
│   └── validation/   # Validation logic tests
├── integration/      # Integration tests
│   ├── actions/      # Server action tests
│   ├── api/          # API route tests
│   ├── auth/         # Authentication tests
│   ├── data/         # Data fetching tests
│   └── error-handling.test.ts
├── e2e/              # End-to-end tests (Playwright)
├── fixtures/          # Test data fixtures
└── utils/             # Test utilities and helpers
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

### Run with Coverage

```bash
npm run test:coverage
```

This generates coverage reports in:

- `coverage/` directory (HTML report)
- `coverage/coverage-final.json` (JSON report)
- `coverage/lcov.info` (LCOV format)

### Watch Mode

```bash
# Run tests in watch mode (auto-rerun on file changes)
npm test -- --watch
```

## Test Patterns

### Server Action Tests

Server actions are tested with mocked Supabase clients. Focus on:

1. **Input Validation** - Required fields, format validation
2. **Business Logic** - Duplicate prevention, permission checks
3. **Error Handling** - Database errors, constraint violations
4. **Success Paths** - Proper return values and cache revalidation

**Example:**

```typescript
// tests/integration/actions/routes.test.ts
describe('createRoute', () => {
  it('returns error for empty route name', async () => {
    const result = await createRoute({
      name: '',
      slug: 'test-route',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Route name is required')
  })

  it('handles duplicate slug error', async () => {
    mockModule.__mockInsertError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    })

    const result = await createRoute({
      name: 'Test Route',
      slug: 'existing-slug',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('A route with this slug already exists')
  })
})
```

### Data Fetching Tests

Data fetching functions are tested with mocked Supabase responses. Focus on:

1. **Data Transformation** - Correct shape and format
2. **Error Handling** - Graceful degradation (return empty arrays/null)
3. **Empty States** - Handling no results
4. **Query Building** - Correct filters and sorting

**Example:**

```typescript
// tests/integration/data/events.test.ts
describe('getEventsByChapter', () => {
  it('transforms events correctly', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        slug: 'spring-200-2025',
        event_date: '2025-05-15',
        name: 'Spring 200',
        event_type: 'brevet',
        distance_km: 200,
        start_location: 'Toronto',
        start_time: '08:00',
        registrations: [{ count: 5 }],
      },
    ]

    mockModule.__mockEventsFound(mockEvents)

    const result = await getEventsByChapter('toronto')

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Spring 200')
    expect(result[0].type).toBe('Brevet')
    expect(result[0].registeredCount).toBe(5)
  })

  it('handles query errors gracefully', async () => {
    mockModule.__mockQueryError({
      message: 'Database error',
    })

    const result = await getEventsByChapter('toronto')

    expect(result).toEqual([])
  })
})
```

### Component Tests

Component tests use React Testing Library. Focus on:

1. **Rendering** - Components render correctly
2. **User Interactions** - Form submissions, button clicks
3. **Validation** - Error messages display correctly
4. **Loading States** - Transitions and async operations
5. **localStorage Integration** - Saved form data
6. **Error States** - Error message display
7. **Success States** - Success message display

**Example:**

```typescript
// tests/unit/components/registration-form.test.tsx
/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegistrationForm } from '@/components/registration-form'

// Mock server actions
vi.mock('@/lib/actions/register', () => ({
  registerForEvent: vi.fn().mockResolvedValue({ success: true }),
}))

describe('RegistrationForm', () => {
  it('renders all form fields', () => {
    render(<RegistrationForm eventId="event-1" />)

    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('loads saved data from localStorage on mount', () => {
    const savedData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      // ... other fields
    }
    localStorage.setItem('ro-registration', JSON.stringify(savedData))

    render(<RegistrationForm eventId="event-1" />)

    expect(screen.getByDisplayValue('John')).toBeInTheDocument()
  })

  it('calls registerForEvent on submit with correct data', async () => {
    const user = userEvent.setup()
    render(<RegistrationForm eventId="event-1" />)

    await user.type(screen.getByLabelText(/first name/i), 'John')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.type(screen.getByLabelText(/email/i), 'john@example.com')
    // ... fill other required fields

    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(mockRegisterForEvent).toHaveBeenCalledWith({
        eventId: 'event-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        // ... other fields
      })
    })
  })

  it('displays error message on registration failure', async () => {
    mockRegisterForEvent.mockResolvedValueOnce({
      success: false,
      error: 'Event is full',
    })

    const user = userEvent.setup()
    render(<RegistrationForm eventId="event-1" />)

    // Fill form and submit
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(screen.getByText('Event is full')).toBeInTheDocument()
    })
  })
})
```

### E2E Tests

E2E tests use Playwright to test complete user journeys. Focus on:

1. **Critical Flows** - Registration, admin workflows, result submission
2. **Navigation** - Page routing and links
3. **Form Submissions** - Complete form flows
4. **Error Scenarios** - Invalid data, network errors
5. **Authentication** - Login flows and protected routes

**Example:**

```typescript
// tests/e2e/registration-flow.spec.ts
test('can complete registration for scheduled event', async ({ page }) => {
  await page.goto('/calendar/toronto')

  const eventLink = page.locator('a[href^="/register/"]').first()
  if ((await eventLink.count()) === 0) {
    test.skip('No events available')
    return
  }

  await eventLink.click()

  // Fill registration form
  await page.fill('input[name*="firstName"]', 'Test')
  await page.fill('input[name*="lastName"]', 'Rider')
  await page.fill('input[type="email"]', 'test@example.com')

  // Submit form
  await page.click('button[type="submit"]')

  // Should show success message
  await expect(page.locator('text=/success|confirmed/i')).toBeVisible()
})
```

**E2E Test Helpers:**

Use the auth helper for admin login:

```typescript
import { loginAsAdmin } from './helpers/auth'

test('admin can access dashboard', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page).toHaveURL(/\/admin$/)
})
```

**E2E Test Setup:**

E2E tests require test data. Set environment variables:

- `E2E_ADMIN_EMAIL` - Admin email for login tests
- `E2E_ADMIN_PASSWORD` - Admin password for login tests
- `E2E_SUBMISSION_TOKEN` - Result submission token for result tests

Or create test data via seed scripts.

## Mocking Patterns

### Supabase Mocking

Use the mock utilities in `tests/utils/supabase-mock.ts`:

```typescript
import { createMockSupabaseClient } from '@/tests/utils/supabase-mock'

const { client, queryBuilder } = createMockSupabaseClient()

// Configure responses
queryBuilder.setResponse('single', { data: mockEvent, error: null })
```

### Server Action Mocking

Mock server actions at the module level:

```typescript
vi.mock('@/lib/actions/register', () => ({
  registerForEvent: vi.fn().mockResolvedValue({ success: true }),
}))
```

### Next.js Mocking

Next.js modules are mocked in `tests/setup.ts`:

- `next/cache` - Cache functions
- `next/navigation` - Router and navigation
- `react` - React cache

## Test Utilities

### Test Helpers

Use utilities from `tests/utils/test-helpers.ts`:

```typescript
import { createMockEvent, createMockRider, createMockFile } from '@/tests/utils/test-helpers'

const mockEvent = createMockEvent({ name: 'Custom Event' })
const mockFile = createMockFile('test.jpg', 'image/jpeg', 1000)
```

### Fixtures

Use fixtures from `tests/fixtures/`:

```typescript
import { mockEvents, mockRiders } from '@/tests/fixtures/events'
import { mockRiders } from '@/tests/fixtures/riders'
```

## Error Handling Tests

Error handling is tested comprehensively in `tests/integration/error-handling.test.ts`:

- **Database Errors** - Constraint violations, foreign keys, not found
- **Network Errors** - Timeouts, connection refused
- **Permission Errors** - Unauthorized access, forbidden operations
- **Validation Errors** - Invalid formats, type mismatches

## Coverage Goals

Current coverage thresholds (in `vitest.config.mts`):

- **Lines**: 60%
- **Functions**: 60%
- **Branches**: 50%
- **Statements**: 60%

To view coverage:

```bash
npm run test:coverage
open coverage/index.html
```

## Best Practices

### 1. Test Behavior, Not Implementation

Focus on what the code does, not how it does it:

```typescript
// ✅ Good - tests behavior
it('returns error when route is used by events', async () => {
  const result = await deleteRoute('route-1')
  expect(result.error).toBe('Cannot delete route that is used by events')
})

// ❌ Bad - tests implementation details
it('calls getSupabaseAdmin().from("events")', async () => {
  // Don't test internal implementation
})
```

### 2. Use Descriptive Test Names

Test names should clearly describe what is being tested:

```typescript
// ✅ Good
it('returns error for password shorter than 8 characters', async () => {
  // ...
})

// ❌ Bad
it('test password', async () => {
  // ...
})
```

### 3. Test Edge Cases

Don't just test the happy path:

```typescript
describe('createResult', () => {
  it('creates result successfully') // Happy path
  it('returns error when result already exists') // Duplicate
  it('allows null finish time for non-finished statuses') // Edge case
  it('handles database errors') // Error case
})
```

### 4. Keep Tests Isolated

Each test should be independent:

```typescript
beforeEach(() => {
  mockModule.__reset()
  vi.clearAllMocks()
})
```

### 5. Use Appropriate Test Types

- **Unit tests** - Pure functions, utilities, simple components
- **Integration tests** - Server actions, data fetching, API routes
- **E2E tests** - Complete user journeys, critical flows

## Common Test Scenarios

### Testing Server Actions

```typescript
describe('createEvent', () => {
  // Validation
  it('returns error for missing required fields')
  it('returns error for invalid date format')

  // Business logic
  it('prevents duplicate slugs')
  it('validates chapter exists')

  // Permissions
  it('requires admin authentication')
  it('allows chapter admin for their chapter')

  // Success
  it('creates event successfully')
  it('revalidates cache after creation')
})
```

### Testing React Components

```typescript
describe('RegistrationForm', () => {
  // Rendering
  it('renders all form fields')
  it('loads saved data from localStorage')

  // User interactions
  it('allows typing in input fields')
  it('allows selecting from dropdowns')
  it('allows toggling checkboxes')

  // Form submission
  it('calls server action on submit')
  it('shows success message on success')
  it('shows error message on failure')
  it('saves form data to localStorage on success')

  // Validation
  it('shows validation errors for empty fields')
  it('prevents submission with invalid data')

  // Special features
  it('shows rider match dialog when needed')
  it('handles file uploads correctly')
  it('disables form while pending')
})
```

### Testing Data Fetching

```typescript
describe('getEventsByChapter', () => {
  // Data transformation
  it('transforms events correctly')
  it('handles missing optional fields')

  // Filtering
  it('filters for scheduled events only')
  it('excludes permanent events')

  // Error handling
  it('returns empty array on error')
  it('handles invalid chapter slug')
})
```

### Testing Error Handling

```typescript
describe('handleSupabaseError', () => {
  it('handles unique constraint violation (23505)')
  it('handles foreign key violation (23503)')
  it('handles not found error (PGRST116)')
  it('uses custom user message when provided')
  it('handles unknown error codes')
})
```

## Debugging Tests

### Run Single Test File

```bash
npm test -- tests/integration/actions/routes.test.ts
```

### Run Tests Matching Pattern

```bash
npm test -- --grep "createRoute"
```

### Run E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific E2E test file
npx playwright test tests/e2e/registration-flow.spec.ts

# Run E2E tests in UI mode (interactive)
npm run test:e2e:ui
```

### Debug in VS Code

Add breakpoints and use the VS Code debugger with this configuration:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test", "--", "--no-coverage"],
  "console": "integratedTerminal"
}
```

### E2E Test Environment Setup

E2E tests require a running development server and test data:

1. **Start the dev server:**

   ```bash
   npm run dev
   ```

2. **Set up test data:**
   - Create test admin user (or use seed data)
   - Create test events
   - Create test results with submission tokens

3. **Set environment variables:**

   ```bash
   export E2E_ADMIN_EMAIL=admin@test.com
   export E2E_ADMIN_PASSWORD=testpassword123
   export E2E_SUBMISSION_TOKEN=test-token-uuid
   ```

4. **Run E2E tests:**
   ```bash
   npm run test:e2e
   ```

Note: E2E tests will skip if required test data is not available.

## CI/CD Integration

Tests run automatically in CI/CD pipelines. Coverage reports are generated and can be uploaded to services like:

- Codecov
- Coveralls
- GitHub Actions (with coverage comments)

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System architecture
- [Data Layer Guide](./DATA_LAYER.md) - Data fetching patterns
- [Error Handling Guide](./ERROR_HANDLING.md) - Error handling patterns
- [Contributing Guide](./CONTRIBUTING.md) - Development workflow

## Getting Help

If you encounter issues with tests:

1. Check existing test files for similar patterns
2. Review the test utilities in `tests/utils/`
3. Check the fixtures in `tests/fixtures/`
4. Review error messages and stack traces carefully
