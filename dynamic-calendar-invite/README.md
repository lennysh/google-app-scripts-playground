# Dynamic calendar invite

Finds the next occurrence of a named event on a **shared** calendar, checks guest FreeBusy data, and moves the event to the candidate start with the fewest conflicts.

Designed for a recurring weekly meeting that should land in a fixed daily window (default: upcoming **Tuesday**, 12:00–17:00 in the script timezone) while preferring later afternoon slots when possible. Duration is taken from the discovered invite and preserved on move.

## What it does

1. Locates the shared calendar by ID.
2. Searches for `EVENT_TITLE` inside the configured time window.
3. Reads guest emails from the event.
4. Queries the Calendar Advanced Service (`Calendar.Freebusy`).
5. Scores candidate starts every `SLOT_STEP_MINUTES` from latest → earliest start (defaults: 15 minutes, `16:00` → `12:00`), using the invite’s existing duration (slots that would end after the window are skipped).
6. Reschedules to the best slot, or logs the choice when dry-run is on.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. In the Apps Script editor, enable the **Calendar API** advanced service (Services → Calendar → add). The manifest already declares it.
4. Edit the `--- CONFIGURATION ---` block at the top of `rescheduleSharedEvent`:

```javascript
const DRY_RUN = true;
const EVENT_TITLE = "Weekly Team Sync";
const CALENDAR_ID = "abc123@group.calendar.google.com";
const TARGET_WEEKDAY = 2;          // Tuesday
const SLOT_STEP_MINUTES = 15;      // or 5, 10, etc.
// …plus window / start-bound hours if needed
```

5. Ensure you can edit the shared calendar and that the target event already has guests.
6. Run `rescheduleSharedEvent` with dry-run on, review logs, then set `DRY_RUN` to `false`.

### Optional: time-driven trigger

Add a trigger for `rescheduleSharedEvent` (for example weekly on Monday) if you want this to run unattended.

## Config reference

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = call `event.setTime` |
| `EVENT_TITLE` | `"Weekly Team Sync"` | Search string passed to `getEvents(..., { search })` |
| `CALENDAR_ID` | placeholder | Shared calendar that owns the event |
| `TARGET_WEEKDAY` | `2` | Day to target: `0`=Sun … `6`=Sat |
| `WINDOW_START_HOUR` / `_MINUTE` | `12` / `0` | Start of FreeBusy + event search window |
| `WINDOW_END_HOUR` / `_MINUTE` | `17` / `0` | End of that window (slots ending after this are skipped) |
| `LATEST_START_HOUR` / `_MINUTE` | `16` / `0` | First (preferred) candidate start |
| `EARLIEST_START_HOUR` / `_MINUTE` | `12` / `0` | Last candidate start walked |
| `SLOT_STEP_MINUTES` | `15` | Minutes between candidate starts (`5` = finer walk) |

Duration is **not** a config var — it is read from the discovered invite and kept on move.

Wall-clock hours use the project timezone in the manifest (`America/New_York` by default).

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

### Recommendation: show the series as Free

Mark the target recurring event (or series) as **Free** / transparent in Calendar — not Busy.

`Calendar.Freebusy` only returns opaque busy intervals. It does not include event ids or titles, so the script cannot reliably ignore “this same meeting” when scoring slots. If the series is Busy, guests who already have the upcoming occurrence look conflicted in the **current** slot, which skews the pick toward other candidates.

Showing the meeting as Free keeps it visible on calendars and in invites, but FreeBusy no longer treats it as a conflict—so availability checks reflect everyone else’s real meetings. (Tradeoff: other FreeBusy-based tools also won’t see this series as blocking.)
