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

The `registrations` table has a `team_name` column for future team registration support (Phase 2).

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

## Phase 2 Roadmap: Team Registration

Future work will add team-based registration for fleche events:

- Riders register as a team with a team name
- Team captain manages the roster
- Registration uses the `team_name` column on the `registrations` table
- Team validation (3-5 riders per team)
