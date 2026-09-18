# Dynamic calendar invite

Finds the next occurrence of a named event on a **shared** calendar, checks guest FreeBusy data, and moves the event to the candidate hour with the fewest conflicts.

Designed for a recurring weekly meeting that should land in a fixed daily window (default: upcoming **Tuesday**, 12:00–17:00 in the script timezone) while preferring later afternoon slots when possible.

## What it does

1. Locates the shared calendar by ID.
2. Searches for `EVENT_TITLE` inside the configured time window.
3. Reads guest emails from the event.
4. Queries the Calendar Advanced Service (`Calendar.Freebusy`).
5. Scores candidate start hours (`16`, `15`, `14`, `13`, `12` by default — Eastern-style wall clock via the project timezone).
6. Reschedules to the best slot, or logs the choice when dry-run is on.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. In the Apps Script editor, enable the **Calendar API** advanced service (Services → Calendar → add). The manifest already declares it.
4. Set config at the top of `rescheduleSharedEvent`:

```javascript
const DRY_RUN = true;
const EVENT_TITLE = "Weekly Team Sync";
const CALENDAR_ID = "abc123@group.calendar.google.com";
```

5. Ensure you can edit the shared calendar and that the target event already has guests.
6. Run `rescheduleSharedEvent` with dry-run on, review logs, then set `DRY_RUN` to `false`.

### Optional: time-driven trigger

Add a trigger for `rescheduleSharedEvent` (for example weekly on Monday) if you want this to run unattended.

## Config reference

| Setting | Meaning |
|---------|---------|
| `DRY_RUN` | `true` = log only; `false` = call `event.setTime` |
| `EVENT_TITLE` | Search string passed to `getEvents(..., { search })` |
| `CALENDAR_ID` | Shared calendar that owns the event |
| Window / candidates | Hard-coded: next Tuesday, 12:00–17:00 search window, candidate hours `[16, 15, 14, 13, 12]` |

Edit the date math and `candidateHours` in `Code.gs` if your meeting is not a Tuesday afternoon in `America/New_York`.

## Files

| File | Role |
|------|------|
| `Code.gs` | Script logic (`rescheduleSharedEvent`) |
| `appsscript.js` | Manifest: Calendar + Calendar Events scopes, Calendar advanced service |

## Notes

- Attendee emails are taken from the event guest list at runtime (nothing is hard-coded).
- FreeBusy accuracy depends on guests sharing free/busy (typical for Workspace domains).
- If multiple events match the search, the first result is used.
- Project timezone in the manifest is `America/New_York`; change it if your “wall clock” hours should differ.
