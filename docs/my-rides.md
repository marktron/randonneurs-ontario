# My Rides — Quick View on Homepage

## Overview

Returning visitors who have previously registered for a ride see a personalized "Your Rides" section in the homepage sidebar, above the general Upcoming Rides list. This uses the email saved in `localStorage` during registration — no login required. The section has a subtle background tint to distinguish it from the rest of the sidebar.

## How It Works

1. **Registration saves data**: When a rider registers for any event, `localStorage` stores their name and email under the key `ro-registration`.
2. **Homepage checks for saved data**: The `MyRidesSection` client component reads `localStorage` on mount.
3. **Server action fetches rides**: If an email is found, it calls `getMyUpcomingRides(email)` which queries the database for upcoming registered events.
4. **Conditional rendering**: If rides are found, the section fades in. If not (or if no saved data), nothing is rendered — no layout shift.

## Behavior Matrix

| Visitor type                             | What they see                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| First-time visitor (no localStorage)     | Normal homepage — no extra section                                         |
| Returning visitor with upcoming rides    | "Your Rides" section in sidebar with ride list (first 3 shown, expandable) |
| Returning visitor with no upcoming rides | Normal homepage — section not rendered                                     |
| Corrupted localStorage                   | Normal homepage — section not rendered                                     |

## Files

| File                              | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `lib/actions/my-rides.ts`         | Server action: `getMyUpcomingRides(email)`                                   |
| `components/my-rides-section.tsx` | Client component: reads localStorage, calls server action, renders UI        |
| `app/page.tsx`                    | Homepage: includes `<MyRidesSection />` in sidebar above `<UpcomingRides />` |

## Security

- **Email sent via POST** (server action), never in URL
- **No enumeration**: Unknown emails return `[]`, same as "no upcoming rides"
- **No PII in response**: Only public event data (names, dates, distances) already visible on the calendar
- **firstName in greeting** comes from localStorage, not from server

## Data Flow

```
localStorage('ro-registration')
  → { email, firstName }
  → getMyUpcomingRides(email)    [server action, POST]
  → riders table (lookup by email)
  → registrations JOIN events JOIN chapters
  → filter: status='registered', event status='scheduled', date >= today
  → MyUpcomingRide[] (slug, name, date, distance, startTime, startLocation, chapterName)
```

## Testing

```bash
# Server action tests
npx vitest run tests/integration/actions/my-rides.test.ts

# Component tests
npx vitest run tests/unit/components/my-rides-section.test.tsx
```
