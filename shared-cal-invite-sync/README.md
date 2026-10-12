# Shared calendar invite sync

Copies matching events from one or more **shared** calendars onto your **primary** calendar, then keeps them in sync (create / update / delete) within a configurable date window.

Useful when you want shared-team events on your personal agenda without accepting every invite, or when a resource calendar holds meetings you care about.

## What it does

1. Takes a script lock so overlapping trigger/manual runs cannot both CREATE.
2. Scans each configured source calendar between `LOOKBACK_DAYS` and `LOOKAHEAD_DAYS`.
3. Optionally filters by title keywords (case-insensitive substring match). Empty `keywords: []` syncs **all** events from that calendar.
4. Creates or updates matching events on your primary calendar.
5. Tags synced events in the description with `[SyncedID: …]` so later runs can update or remove them.
6. Before creating, also matches an existing primary event by **title + start + end** (adopts/retag instead of duplicating).
7. Deletes obvious primary duplicates (same SyncedID or same title+slot), then deletes stale sync copies whose source disappeared.

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
| `SYNC_TAG_PREFIX` / `SYNC_TAG_SUFFIX` | Marker embedded in descriptions; leave as-is once events exist |

## One-off: wipe duplicate copies on a day

If the sync somehow left many identical invites on the same day, use `Cleanup.gs`:

1. Paste `Cleanup.gs` into the same Apps Script project (alongside `Code.gs`).
2. Edit `CLEANUP_CONFIG` (`TARGET_DATE`, `EVENT_TITLE`; leave `DRY_RUN: true`).
3. Run `deleteDuplicateInvitesOnDate`, review the log.
4. Set `DRY_RUN: false` and run again to delete.

| Key | Meaning |
|-----|---------|
| `DRY_RUN` | `true` = log only; `false` = delete |
| `TARGET_DATE` | Day to scan (`YYYY-MM-DD`, script timezone) |
| `EVENT_TITLE` | Title to match on the primary calendar |
| `MATCH_MODE` | `"exact"` (default, safer) or `"includes"` |

## Files

| File | Role |
|------|------|
| `Code.gs` | Script logic (`syncSharedEvents`) |
| `Cleanup.gs` | One-off `deleteDuplicateInvitesOnDate` for same-day duplicates |
| `appsscript.js` | Project manifest (timezone, OAuth scopes) |

## Why duplicates used to pile up

Older versions only skipped CREATE when a primary event already had a matching `[SyncedID: …]` tag. If a run overlapped another, or the tag was missing/unparsed, every sync pass created **another** copy of the same invite. With a frequent time-driven trigger that becomes dozens or hundreds of identical entries on one day.

Mitigations now in `Code.gs`:

- `LockService` — skip the run if another sync is already in progress
- Fingerprint adopt — reuse title+start+end matches instead of creating
- Duplicate sweep — delete extra primary copies with the same SyncedID or same slot
- Stricter tag parse/write helpers

After cleaning with `Cleanup.gs`, redeploy this `Code.gs` before leaving a live trigger on.

## Notes

- Recurring instances are tracked per occurrence (`eventId` + start timestamp).
- Location and title/time updates propagate; description on the primary event is rewritten with the sync tag on create/adopt.
- All-day events are handled separately from timed events.
- Cleanup only scans the primary calendar for one local calendar day.
- Prefer a modest trigger interval (e.g. hourly), not every minute.
