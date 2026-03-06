# Fleche Events

## What is a Fleche?

A Fleche (French for "arrow") is a 24-hour team cycling event where teams of 3-5 riders design their own routes and try to cover as much distance as possible. Unlike brevets where everyone rides the same route, each fleche team picks a unique route that converges on a common finish point.

Key differences from brevets:

- **Team-based**: Results are grouped by team, not individual
- **Variable distance**: Each team covers a different distance based on their route
- **No fixed route**: Teams design their own routes
- **Minimum 360 km**: Teams must cover at least 360 km to qualify

## Database Representation

### Results table

Fleche results use the existing `results` table with:

- `team_name` (TEXT): The team name for this rider's result
- `distance_km` (NUMBER): The actual distance covered by the team (may differ from the event's nominal 360 km)
- `event_type` on the parent event is set to `'fleche'`

All riders on the same team share the same `team_name` and `distance_km` values.

### Registrations table

The `registrations` table has fleche-specific columns:

- `team_name` (TEXT): The team name this rider is registered under
- `is_team_captain` (BOOLEAN, default false): Whether this rider created the team

## How Results Display

Fleche events have a dedicated results page at `/results/{year}/fleche`, accessible from the "Fleche" link in the Results navigation menu.

### Public results page

Fleche events show team-grouped results instead of the flat rider grid used for brevets:

- **Event header**: Shows "Fleche Destination: [destination]" using the event's `start_location` field, plus date, team count, and total rider count
- **Per team**: Team name and distance on the same line (3-column grid matching brevet layout), with riders listed beneath
- **Ordering**: Teams sorted by distance descending (furthest distance first)
- **Unknown teams**: Results with no team name are grouped under "Unknown Team" and shown last with subdued styling
- **DNF/DNS**: Shown within their team at full opacity, with a DNF label

### Rider profile page (`/riders/{slug}`)

For fleche results, the notes column shows "Team: {teamName}" alongside any other notes.

### Season stats

The total distance stat for a season correctly accounts for fleche events by summing actual per-team distances rather than using the event's nominal distance.

## Admin Workflow

### Entering fleche results

1. Navigate to the event in Admin > Events
2. For fleche events, the results table shows additional "Team" and "Distance" columns
3. Enter each rider's team name and the team's actual distance
4. All riders on the same team should have the same team name and distance values
5. Set status to "Finished" for completing riders, "DNF" for those who didn't finish

### Tips

- Enter the team name for one rider, then copy it exactly for teammates
- Distance is per-team, so all members of a team should have the same distance value
- The distance entered here is what appears in the public results, so use the verified/official distance

## Registration Flow

Fleche events use a dedicated registration form (`FlecheRegistrationForm`) that adds a team section above the standard personal details fields. The form is served at the same `/register/[slug]` URL, detected by `event.type === 'Fleche'`.

### Team selection

Riders choose between two modes:

1. **Create a new team**: Enter a team name. Validated for uniqueness (case-insensitive) within the event.
2. **Join an existing team**: Select from a dropdown of existing teams showing team name and current member count. Teams with 5+ members show a warning that additional riders are alternates.

### Registration page display

The "Registered" section groups riders by team (alphabetically), with unassigned riders shown last in a subdued style.

### Data flow

- `registerForEvent()` accepts optional `teamName` and `isTeamCaptain` fields
- Team data is stored on the `registrations` table (`team_name`, `is_team_captain`)
- `getFlecheTeams(eventId)` queries existing teams for the join dropdown
- `getRegisteredRidersWithTeams(eventId)` returns riders with team info for display

### Team size rules

Teams have a soft limit of 3-5 riders (per ACP fleche rules). The form warns when a team has 5+ members but does not block registration, since alternates are allowed.

### Admin team name editing

In the admin event detail page, team names are editable on both registration and result records:

- **Before results are entered**: Editing a team name in the admin updates the `registrations.team_name` column via `updateRegistrationTeamName()`. This lets admins correct team assignments before an event.
- **After results are entered**: Editing updates the `results.team_name` column via `updateResult()`.
- **Captain badge**: Riders who created a team (where `is_team_captain = true`) display a "Captain" badge next to their name.
- **Pre-population**: When creating a result for a fleche rider, the team name input is pre-populated from their registration data.

## Phase 3 Roadmap: Team Management

Future work may add:

- Team captain can edit roster (add/remove riders)
- Team route planning integration
- Pre-event team validation (minimum 3 riders)
