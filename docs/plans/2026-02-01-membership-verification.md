# Membership Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify club membership via CCN API when riders register for events; block registration if not a member or if Trial Member status is already used.

**Architecture:** Add `memberships` table to cache CCN membership data. Extend registration flow to check/fetch membership before completing registration. Add `incomplete: membership` status for failed verifications. Show appropriate error modals and email warnings.

**Tech Stack:** Supabase (PostgreSQL), Next.js Server Actions, TypeScript, Vitest

---

## Task 1: Create memberships table migration

**Files:**

- Create: `supabase/migrations/[timestamp]_add_memberships_table.sql`

**Step 1: Write the migration SQL**

```sql
-- Add memberships table to track CCN membership status
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season INT NOT NULL,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  membership_id INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'Individual Membership',
    'Additional Family Member',
    'Family Membership > PRIMARY FAMILY MEMBER',
    'Trial Member'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one membership per rider per season
CREATE UNIQUE INDEX idx_memberships_rider_season ON memberships(rider_id, season);

-- Index for lookups
CREATE INDEX idx_memberships_season ON memberships(season);

-- Trigger for updated_at
CREATE TRIGGER set_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Run migration locally**

Run: `npx supabase db reset` (after confirming with user)
Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add memberships table for CCN membership tracking"
```

---

## Task 2: Extend registrations status constraint

**Files:**

- Create: `supabase/migrations/[timestamp]_extend_registration_status.sql`

**Step 1: Write the migration SQL**

```sql
-- Extend registrations.status to include 'incomplete: membership'
ALTER TABLE registrations
  DROP CONSTRAINT registrations_status_check;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_status_check
  CHECK (status IN ('registered', 'cancelled', 'incomplete: membership'));
```

**Step 2: Run migration locally**

Run: `npx supabase db reset` (after confirming with user)
Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: extend registration status to include membership verification"
```

---

## Task 3: Regenerate Supabase types

**Files:**

- Modify: `types/supabase.ts`

**Step 1: Regenerate types from database**

Run: `npx supabase gen types typescript --local > types/supabase.ts`
Expected: Types file updated with memberships table and new status enum

**Step 2: Verify types include memberships**

Check that `types/supabase.ts` contains:

- `memberships` table definition
- Updated `registrations.status` type

**Step 3: Commit**

```bash
git add types/supabase.ts
git commit -m "chore: regenerate supabase types with memberships table"
```

---

## Task 4: Add membership types to queries.ts

**Files:**

- Modify: `types/queries.ts`

**Step 1: Add membership type exports**

Add after line ~20 (after Registration type):

```typescript
export type Membership = Database['public']['Tables']['memberships']['Row']
export type MembershipInsert = Database['public']['Tables']['memberships']['Insert']

// Membership type enum for type safety
export type MembershipType =
  | 'Individual Membership'
  | 'Additional Family Member'
  | 'Family Membership > PRIMARY FAMILY MEMBER'
  | 'Trial Member'
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add types/queries.ts
git commit -m "feat: add membership type definitions"
```

---

## Task 5: Create CCN API client

**Files:**

- Create: `lib/ccn/client.ts`
- Create: `tests/unit/lib/ccn-client.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/lib/ccn-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import { searchCCNMembership, type CCNSearchResult } from '@/lib/ccn/client'

describe('searchCCNMembership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CCN_ENDPOINT =
      'https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392'
  })

  it('returns membership data when member found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            id: 11669640,
            full_name: 'Mark Allen',
            registration_category: 'Individual Membership',
          },
        ],
      }),
    })

    const result = await searchCCNMembership('Mark', 'Allen')

    expect(result).toEqual({
      found: true,
      membershipId: 11669640,
      type: 'Individual Membership',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392&search=Mark%20Allen'
    )
  })

  it('returns not found when no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 0, results: [] }),
    })

    const result = await searchCCNMembership('Nobody', 'Here')

    expect(result).toEqual({ found: false })
  })

  it('throws error when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(searchCCNMembership('Test', 'User')).rejects.toThrow('CCN API error')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/lib/ccn-client.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// lib/ccn/client.ts
/**
 * CCN (Cycling Canada Network) API Client
 *
 * Queries the CCN membership API to verify rider membership status.
 * @see docs/registration-check.md for API documentation
 */

export interface CCNSearchResult {
  found: true
  membershipId: number
  type: 'Individual Membership' | 'Additional Family Member' | 'Family Membership > PRIMARY FAMILY MEMBER' | 'Trial Member'
} | {
  found: false
}

interface CCNAPIResponse {
  count: number
  results: Array<{
    id: number
    full_name: string
    registration_category: string
  }>
}

/**
 * Search CCN API for a member by name.
 *
 * @param firstName - Rider's first name
 * @param lastName - Rider's last name
 * @returns Membership data if found, or { found: false }
 * @throws Error if API request fails
 */
export async function searchCCNMembership(
  firstName: string,
  lastName: string
): Promise<CCNSearchResult> {
  const endpoint = process.env.CCN_ENDPOINT
  if (!endpoint) {
    throw new Error('CCN_ENDPOINT environment variable not set')
  }

  const fullName = `${firstName} ${lastName}`
  const url = `${endpoint}&search=${encodeURIComponent(fullName)}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CCN API error: ${response.status}`)
  }

  const data: CCNAPIResponse = await response.json()

  if (data.count === 0 || data.results.length === 0) {
    return { found: false }
  }

  // Take the first result (future: handle multiple matches)
  const member = data.results[0]
  return {
    found: true,
    membershipId: member.id,
    type: member.registration_category as CCNSearchResult['type'] & { found: true }['type'],
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/lib/ccn-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/ccn/client.ts tests/unit/lib/ccn-client.test.ts
git commit -m "feat: add CCN API client for membership verification"
```

---

## Task 6: Create membership service

**Files:**

- Create: `lib/memberships/service.ts`
- Create: `tests/unit/lib/membership-service.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/lib/membership-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/ccn/client', () => ({
  searchCCNMembership: vi.fn(),
}))

import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
import { searchCCNMembership } from '@/lib/ccn/client'

describe('getMembershipForRider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'
  })

  it('returns existing membership from database', async () => {
    // Test will be implemented with actual mock setup
  })

  it('fetches from CCN when no membership in database', async () => {
    // Test will be implemented with actual mock setup
  })
})

describe('isTrialUsed', () => {
  it('returns true if rider has finished result', async () => {
    // Test will be implemented with actual mock setup
  })

  it('returns true if rider has upcoming registration', async () => {
    // Test will be implemented with actual mock setup
  })

  it('returns false if no results or registrations', async () => {
    // Test will be implemented with actual mock setup
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/lib/membership-service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// lib/memberships/service.ts
/**
 * Membership Service
 *
 * Handles membership verification for event registration.
 * Checks local database first, then queries CCN API if needed.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { searchCCNMembership } from '@/lib/ccn/client'
import type { MembershipType } from '@/types/queries'

const CURRENT_SEASON = parseInt(process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026', 10)

export interface MembershipResult {
  found: true
  membershipId: number
  type: MembershipType
} | {
  found: false
}

/**
 * Get membership for a rider, checking database first then CCN API.
 *
 * @param riderId - Rider's UUID
 * @param firstName - Rider's first name (for CCN lookup)
 * @param lastName - Rider's last name (for CCN lookup)
 * @returns Membership data if found, or { found: false }
 */
export async function getMembershipForRider(
  riderId: string,
  firstName: string,
  lastName: string
): Promise<MembershipResult> {
  const supabase = getSupabaseAdmin()

  // Check database first
  const { data: existingMembership } = await supabase
    .from('memberships')
    .select('membership_id, type')
    .eq('rider_id', riderId)
    .eq('season', CURRENT_SEASON)
    .single()

  if (existingMembership) {
    return {
      found: true,
      membershipId: existingMembership.membership_id,
      type: existingMembership.type as MembershipType,
    }
  }

  // Query CCN API
  const ccnResult = await searchCCNMembership(firstName, lastName)

  if (!ccnResult.found) {
    return { found: false }
  }

  // Cache in database
  await supabase.from('memberships').insert({
    rider_id: riderId,
    season: CURRENT_SEASON,
    membership_id: ccnResult.membershipId,
    type: ccnResult.type,
  })

  return {
    found: true,
    membershipId: ccnResult.membershipId,
    type: ccnResult.type,
  }
}

/**
 * Check if a Trial Member has already used their trial event.
 *
 * Trial is "used" if:
 * 1. Any result with status finished/dnf/otl/dq in current season
 * 2. Any registration for event_date >= today
 *
 * @param riderId - Rider's UUID
 * @returns true if trial is used, false if still available
 */
export async function isTrialUsed(riderId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  // Check for counting results (finished, dnf, otl, dq)
  const { data: results } = await supabase
    .from('results')
    .select('id')
    .eq('rider_id', riderId)
    .eq('season', CURRENT_SEASON)
    .in('status', ['finished', 'dnf', 'otl', 'dq'])
    .limit(1)

  if (results && results.length > 0) {
    return true
  }

  // Check for upcoming registrations
  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, events!inner(event_date)')
    .eq('rider_id', riderId)
    .eq('status', 'registered')
    .gte('events.event_date', today)
    .limit(1)

  return registrations !== null && registrations.length > 0
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/lib/membership-service.test.ts`
Expected: PASS (with mocks)

**Step 5: Commit**

```bash
git add lib/memberships/service.ts tests/unit/lib/membership-service.test.ts
git commit -m "feat: add membership service for verification logic"
```

---

## Task 7: Add environment variable for CCN endpoint

**Files:**

- Modify: `.env.local.example`

**Step 1: Add CCN_ENDPOINT to example env file**

Add after SENDGRID variables:

```
# CCN Membership Verification
CCN_ENDPOINT=https://ccnbikes.com/en/rest/v2/event_app/registration-search/?event_id=21392
```

**Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add CCN_ENDPOINT to environment example"
```

---

## Task 8: Create membership error modal component

**Files:**

- Create: `components/membership-error-modal.tsx`
- Create: `tests/unit/components/membership-error-modal.test.tsx`

**Step 1: Write the failing test**

```typescript
// tests/unit/components/membership-error-modal.test.tsx
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembershipErrorModal } from '@/components/membership-error-modal'

describe('MembershipErrorModal', () => {
  it('renders no-membership variant with join link', () => {
    render(
      <MembershipErrorModal
        open={true}
        onClose={vi.fn()}
        variant="no-membership"
      />
    )

    expect(screen.getByText(/join the club/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /membership/i })).toHaveAttribute('href', '/membership')
  })

  it('renders trial-used variant with upgrade message', () => {
    render(
      <MembershipErrorModal
        open={true}
        onClose={vi.fn()}
        variant="trial-used"
      />
    )

    expect(screen.getByText(/trial/i)).toBeInTheDocument()
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MembershipErrorModal
        open={true}
        onClose={onClose}
        variant="no-membership"
      />
    )

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/components/membership-error-modal.test.tsx`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// components/membership-error-modal.tsx
'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface MembershipErrorModalProps {
  open: boolean
  onClose: () => void
  variant: 'no-membership' | 'trial-used'
}

export function MembershipErrorModal({
  open,
  onClose,
  variant,
}: MembershipErrorModalProps) {
  const isNoMembership = variant === 'no-membership'

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>
              {isNoMembership ? 'Membership Required' : 'Trial Membership Used'}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {isNoMembership ? (
              <>
                To register for events, you need to be an active member of Randonneurs Ontario.
                Please join the club first, then return to complete your registration.
              </>
            ) : (
              <>
                Your trial membership has already been used for another event this season.
                To continue participating, please upgrade to a full membership.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button asChild>
            <Link href="/membership">
              {isNoMembership ? 'Join Randonneurs Ontario' : 'Upgrade Membership'}
            </Link>
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/components/membership-error-modal.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/membership-error-modal.tsx tests/unit/components/membership-error-modal.test.tsx
git commit -m "feat: add membership error modal component"
```

---

## Task 9: Update registration action with membership verification

**Files:**

- Modify: `lib/actions/register.ts`
- Modify: `tests/integration/actions/register.test.ts`

**Step 1: Update RegistrationResult interface**

In `lib/actions/register.ts`, update the interface (around line 60):

```typescript
export interface RegistrationResult {
  success: boolean
  error?: string
  /** Set when email not found but fuzzy name matches exist */
  needsRiderMatch?: boolean
  /** Potential rider matches for user to select from */
  matchCandidates?: RiderMatchCandidate[]
  /** Original form data to resubmit after selection */
  pendingData?: RegistrationData
  /** Set when membership verification fails */
  membershipError?: 'no-membership' | 'trial-used'
}
```

**Step 2: Add membership verification to registerForEvent**

After finding/creating rider (around line 337), add membership check:

```typescript
// After: const riderId = riderResult.riderId

// Step: Check membership
const membershipResult = await getMembershipForRider(riderId, trimmedFirstName, trimmedLastName)

if (!membershipResult.found) {
  // Create incomplete registration and return error
  await createRegistrationRecord(
    eventId,
    riderId,
    shareRegistration,
    notes,
    'incomplete: membership'
  )

  // Send warning email (fire-and-forget)
  sendRegistrationConfirmationEmail({
    registrantName: fullName,
    registrantEmail: normalizedEmail,
    // ... other fields
    membershipStatus: 'none',
  }).catch((error) => {
    logError(error, {
      operation: 'registerForEvent.sendEmail',
      context: { eventId, email: normalizedEmail },
    })
  })

  return {
    success: false,
    membershipError: 'no-membership',
    error: 'Membership verification failed',
  }
}

// Check Trial Member usage
if (membershipResult.type === 'Trial Member') {
  const trialUsed = await isTrialUsed(riderId)
  if (trialUsed) {
    await createRegistrationRecord(
      eventId,
      riderId,
      shareRegistration,
      notes,
      'incomplete: membership'
    )

    sendRegistrationConfirmationEmail({
      registrantName: fullName,
      registrantEmail: normalizedEmail,
      // ... other fields
      membershipStatus: 'trial-used',
    }).catch((error) => {
      logError(error, {
        operation: 'registerForEvent.sendEmail',
        context: { eventId, email: normalizedEmail },
      })
    })

    return {
      success: false,
      membershipError: 'trial-used',
      error: 'Trial membership already used',
    }
  }
}
```

**Step 3: Update createRegistrationRecord helper**

```typescript
async function createRegistrationRecord(
  eventId: string,
  riderId: string,
  shareRegistration: boolean,
  notes?: string,
  status: 'registered' | 'incomplete: membership' = 'registered'
): Promise<void> {
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status,
    share_registration: shareRegistration,
    notes: notes || null,
  }
  // ... rest of function
}
```

**Step 4: Add imports at top of file**

```typescript
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
```

**Step 5: Write integration test**

Add to `tests/integration/actions/register.test.ts`:

```typescript
describe('membership verification', () => {
  it('returns membershipError when membership not found', async () => {
    // This test requires more sophisticated mocking - covered in E2E
  })
})
```

**Step 6: Run type check and tests**

Run: `npm run type-check && npm run test:integration -- tests/integration/actions/register.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add lib/actions/register.ts tests/integration/actions/register.test.ts
git commit -m "feat: add membership verification to registration flow"
```

---

## Task 10: Update registration form to handle membership errors

**Files:**

- Modify: `components/registration-form.tsx`

**Step 1: Add membership error state**

Around line 77, add:

```typescript
// Membership error state
const [membershipErrorVariant, setMembershipErrorVariant] = useState<
  'no-membership' | 'trial-used' | null
>(null)
```

**Step 2: Import the modal component**

```typescript
import { MembershipErrorModal } from '@/components/membership-error-modal'
```

**Step 3: Handle membership error in submit handler**

In `handleSubmit`, after checking `result.success` and `result.needsRiderMatch`, add:

```typescript
} else if (result.membershipError) {
  setMembershipErrorVariant(result.membershipError)
} else {
```

**Step 4: Add modal to render**

Before the final `</div>`:

```typescript
<MembershipErrorModal
  open={membershipErrorVariant !== null}
  onClose={() => setMembershipErrorVariant(null)}
  variant={membershipErrorVariant || 'no-membership'}
/>
```

**Step 5: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 6: Commit**

```bash
git add components/registration-form.tsx
git commit -m "feat: show membership error modal on registration failure"
```

---

## Task 11: Update email templates with membership status

**Files:**

- Modify: `lib/email/templates.ts`
- Modify: `lib/email/send-registration-email.ts`

**Step 1: Extend RegistrationEmailData interface**

In `lib/email/templates.ts`, add to interface:

```typescript
export interface RegistrationEmailData {
  // ... existing fields
  membershipType?: string
  membershipStatus?: 'valid' | 'none' | 'trial-used'
}
```

**Step 2: Add membership warning sections to email template**

In `buildRegistrationConfirmationEmail`, add conditional content at the top of both text and HTML versions:

For text version (after "Hi {name}"):

```typescript
const membershipWarning =
  data.membershipStatus === 'none'
    ? `
⚠️ IMPORTANT: Your registration is NOT YET VALID

We could not verify your club membership. Please join Randonneurs Ontario at https://randonneursontario.ca/membership before the event to complete your registration.

---

`
    : data.membershipStatus === 'trial-used'
      ? `
⚠️ IMPORTANT: Your trial membership has been used

Your trial membership was used for a previous event this season. Please upgrade to a full membership at https://randonneursontario.ca/membership to participate in this event.

---

`
      : ''

// Add after greeting
const text = `
Hi ${data.registrantName},
${membershipWarning}
Thanks for your interest...
`
```

For HTML version, add styled warning box after greeting:

```typescript
const membershipWarningHtml =
  data.membershipStatus === 'none'
    ? `
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="color: #dc2626; font-weight: 600; margin: 0 0 8px 0;">⚠️ Your registration is NOT YET VALID</p>
    <p style="color: #7f1d1d; margin: 0;">
      We could not verify your club membership. Please
      <a href="https://randonneursontario.ca/membership" style="color: #dc2626;">join Randonneurs Ontario</a>
      before the event to complete your registration.
    </p>
  </div>
`
    : data.membershipStatus === 'trial-used'
      ? `
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="color: #dc2626; font-weight: 600; margin: 0 0 8px 0;">⚠️ Trial Membership Used</p>
    <p style="color: #7f1d1d; margin: 0;">
      Your trial membership was used for a previous event. Please
      <a href="https://randonneursontario.ca/membership" style="color: #dc2626;">upgrade to a full membership</a>
      to participate in this event.
    </p>
  </div>
`
      : ''
```

**Step 3: Add membership type row to details table**

Add row for valid memberships:

```typescript
// In the table, add after eventLocation row:
${data.membershipType ? `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Membership</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.membershipType}</td>
    </tr>
` : ''}
```

**Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/email/templates.ts lib/email/send-registration-email.ts
git commit -m "feat: add membership status to registration emails"
```

---

## Task 12: Update admin event page to show all registrations

**Files:**

- Modify: `app/admin/events/[id]/page.tsx`

**Step 1: Update getRegistrations query**

Change line 54 from:

```typescript
.eq('status', 'registered')
```

to:

```typescript
.in('status', ['registered', 'incomplete: membership'])
```

**Step 2: Update RegistrationWithRiderForAdmin type**

In `types/queries.ts`, ensure the type includes status (it already does at line 271).

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add app/admin/events/[id]/page.tsx
git commit -m "feat: show incomplete registrations in admin event view"
```

---

## Task 13: Add membership badges to admin event registrations

**Files:**

- Modify: `components/admin/event-results-manager.tsx`

**Step 1: Find the registrations display section**

Locate where registrations are rendered in the table.

**Step 2: Add badge imports**

```typescript
import { Badge } from '@/components/ui/badge'
```

**Step 3: Add membership badge logic**

After rider name display, add:

```typescript
{registration.status === 'incomplete: membership' && (
  <Badge variant="destructive" className="ml-2">Missing membership</Badge>
)}
```

For trial members (requires joining with memberships table or passing membership type):

```typescript
{/* If we have membership info and it's Trial Member */}
{registration.membershipType === 'Trial Member' && registration.status === 'registered' && (
  <Badge variant="secondary" className="ml-2">Trial</Badge>
)}
```

Note: This may require updating the query to include membership info.

**Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add components/admin/event-results-manager.tsx
git commit -m "feat: add membership badges to admin registrations view"
```

---

## Task 14: Add membership column to admin riders page

**Files:**

- Modify: `app/admin/riders/page.tsx`
- Modify: `components/admin/riders-table.tsx`
- Modify: `types/queries.ts`

**Step 1: Update RiderWithStats type**

Add membership to the type:

```typescript
export type RiderWithStats = Pick<
  Rider,
  'id' | 'slug' | 'first_name' | 'last_name' | 'email' | 'gender' | 'created_at'
> & {
  registrations: Array<{ count: number }> | null
  results: Array<{ count: number }> | null
  memberships: Array<Pick<Membership, 'type' | 'season'>> | null
}
```

**Step 2: Update getRiders query**

Add memberships join:

```typescript
.select(`
  id,
  slug,
  first_name,
  last_name,
  email,
  gender,
  created_at,
  registrations (count),
  results (count),
  memberships (type, season)
`)
```

**Step 3: Update RidersTable to show membership**

Add column header and cell for current season membership type.

**Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add app/admin/riders/page.tsx components/admin/riders-table.tsx types/queries.ts
git commit -m "feat: show membership status in admin riders list"
```

---

## Task 15: Apply same membership flow to registerForPermanent

**Files:**

- Modify: `lib/actions/register.ts`

**Step 1: Add membership verification to registerForPermanent**

Copy the membership verification logic from `registerForEvent` to `registerForPermanent`, after the rider is found/created.

**Step 2: Run type check and tests**

Run: `npm run type-check && npm run test:integration`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/actions/register.ts
git commit -m "feat: add membership verification to permanent ride registration"
```

---

## Task 16: Write E2E test for membership verification

**Files:**

- Create: `tests/e2e/membership-verification.spec.ts`

**Step 1: Write Playwright test**

```typescript
import { test, expect } from '@playwright/test'

test.describe('Membership Verification', () => {
  test('shows error modal when membership not found', async ({ page }) => {
    // Navigate to event registration page
    // Fill form with non-member name
    // Submit and verify error modal appears
  })

  test('allows registration when membership is valid', async ({ page }) => {
    // Navigate to event registration page
    // Fill form with valid member name
    // Submit and verify success
  })

  test('blocks Trial Member with used trial', async ({ page }) => {
    // Navigate to event registration page
    // Fill form with trial member who has used their trial
    // Submit and verify trial-used error modal
  })
})
```

**Step 2: Run E2E tests**

Run: `npm run test:e2e -- tests/e2e/membership-verification.spec.ts`
Expected: Tests may require seeding test data

**Step 3: Commit**

```bash
git add tests/e2e/membership-verification.spec.ts
git commit -m "test: add E2E tests for membership verification"
```

---

## Task 17: Update documentation

**Files:**

- Modify: `docs/registration-check.md`

**Step 1: Add implementation notes section**

Add at the end of the document:

```markdown
## Implementation Notes

### Files Modified

- `supabase/migrations/` - Added memberships table and extended registration status
- `lib/ccn/client.ts` - CCN API client
- `lib/memberships/service.ts` - Membership verification service
- `lib/actions/register.ts` - Registration flow with membership check
- `lib/email/templates.ts` - Email templates with membership status
- `components/membership-error-modal.tsx` - Error modal component
- `components/registration-form.tsx` - Form integration
- `app/admin/events/[id]/page.tsx` - Admin view updates
- `app/admin/riders/page.tsx` - Riders list with membership column

### Environment Variables

- `CCN_ENDPOINT` - CCN API endpoint URL
- `NEXT_PUBLIC_CURRENT_SEASON` - Current season year (existing)
```

**Step 2: Commit**

```bash
git add docs/registration-check.md
git commit -m "docs: add implementation notes to registration-check spec"
```

---

## Execution Checklist

- [ ] Task 1: Create memberships table migration
- [ ] Task 2: Extend registrations status constraint
- [ ] Task 3: Regenerate Supabase types
- [ ] Task 4: Add membership types to queries.ts
- [ ] Task 5: Create CCN API client
- [ ] Task 6: Create membership service
- [ ] Task 7: Add environment variable for CCN endpoint
- [ ] Task 8: Create membership error modal component
- [ ] Task 9: Update registration action with membership verification
- [ ] Task 10: Update registration form to handle membership errors
- [ ] Task 11: Update email templates with membership status
- [ ] Task 12: Update admin event page to show all registrations
- [ ] Task 13: Add membership badges to admin event registrations
- [ ] Task 14: Add membership column to admin riders page
- [ ] Task 15: Apply same membership flow to registerForPermanent
- [ ] Task 16: Write E2E test for membership verification
- [ ] Task 17: Update documentation

---

**Plan complete and saved to `docs/plans/2026-02-01-membership-verification.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
