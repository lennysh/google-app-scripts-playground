# Shared calendar invite sync

Copies matching events from one or more **shared** calendars onto your **primary** calendar, then keeps them in sync (create / update / delete) within a configurable date window.

Useful when you want shared-team events on your personal agenda without accepting every invite, or when a resource calendar holds meetings you care about.

## What it does

1. Scans each configured source calendar between `LOOKBACK_DAYS` and `LOOKAHEAD_DAYS`.
2. Optionally filters by title keywords (case-insensitive substring match). Empty `keywords: []` syncs **all** events from that calendar.
3. Creates or updates matching events on your primary calendar.
4. Tags synced events in the description with `[SyncedID: …]` so later runs can update or remove them.
5. Deletes primary-calendar copies whose source events disappeared or no longer match.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`). Required scope: Calendar.
3. Subscribe to each source calendar in Google Calendar (the script runs as you; you must already have access).
4. Edit `CONFIG.TARGETS`:

```javascript
TARGETS: [
  {
    calendarId: "abc123@group.calendar.google.com",
    keywords: ["Weekly Team Sync"]
  }
]
```

5. Keep `DRY_RUN: true`, run `syncSharedEvents`, and check **Executions** / logs.
6. Set `DRY_RUN: false` when the preview looks right.

### Optional: time-driven trigger

In the Apps Script UI: **Triggers** → add trigger → function `syncSharedEvents` → time-driven (e.g. hourly or daily).

## Config reference

| Key | Meaning |
|-----|---------|
| `DRY_RUN` | `true` = log only; `false` = create/update/delete |
| `TARGETS[].calendarId` | Source calendar ID |
| `TARGETS[].keywords` | Title filters; `[]` = sync everything |
| `LOOKAHEAD_DAYS` | How far ahead to sync (default `30`) |
| `LOOKBACK_DAYS` | How far back to maintain (default `0`) |
| `SYNC_TAG` | Marker embedded in descriptions; leave as-is unless you know why |

## Files

| File | Role |
|------|------|
| `Code.gs` | Script logic (`syncSharedEvents`) |
| `appsscript.js` | Project manifest (timezone, OAuth scopes) |

## Notes

- Recurring instances are tracked per occurrence (`eventId` + start timestamp).
- Location and title/time updates propagate; description on the primary event is rewritten with the sync tag on create.
- All-day events are handled separately from timed events.
