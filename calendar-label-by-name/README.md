# Calendar label by name

Scans your **default (primary) calendar**, finds events whose titles match configured names, and assigns each a **Calendar Label** you already defined in Google Calendar.

Uses the Calendar API’s [Labels](https://developers.google.com/workspace/calendar/api/guides/labels) feature (`eventLabelId` + `eventLabelVersion=1`), not the legacy per-event `colorId` palette.

## What it does

1. Loads label definitions from the primary calendar (`labelProperties.eventLabels`).
2. Resolves each rule’s `label` string to a label id (case-insensitive name match).
3. Lists events in the lookback/lookahead window.
4. For each event, applies the **first** matching `RULES` entry (title substring or exact match).
5. Patches `eventLabelId` when the current label differs — or only logs when dry-run is on.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. In the Apps Script editor, enable the **Calendar API** advanced service (Services → Calendar → add). The manifest already declares it.
4. In Google Calendar, create the labels you want (calendar settings / label UI). You must **own** the primary calendar to manage its labels.
5. Run `listCalendarLabels` once and copy the printed names into `CONFIG.RULES`.
6. Edit config:

```javascript
DRY_RUN: true,
RULES: [
  { eventName: "Weekly Team Sync", label: "Team Meeting" },
  { eventName: "1:1", label: "Focus" }
]
```

7. Run `applyCalendarLabelsByName` with dry-run on, review logs, then set `DRY_RUN` to `false`.

### Optional: time-driven trigger

Add a trigger for `applyCalendarLabelsByName` (for example daily) if you want new matching events labeled automatically.

## Config reference

| Key | Meaning |
|-----|---------|
| `DRY_RUN` | `true` = log only; `false` = patch `eventLabelId` |
| `LOOKAHEAD_DAYS` / `LOOKBACK_DAYS` | Scan window relative to now |
| `MATCH_MODE` | `"includes"` (default) or `"exact"` title match |
| `RULES[].eventName` | Title to match |
| `RULES[].label` | Existing Calendar Label **name** on primary |

## Files

| File | Role |
|------|------|
| `Code.gs` | `applyCalendarLabelsByName`, `listCalendarLabels` |
| `appsscript.js` | Manifest: Calendar scopes + Calendar advanced service |

## Notes

- Labels must already exist on the calendar; this script only **assigns** them to events.
- First matching rule wins if several `eventName` patterns hit the same title.
- Recurring series are expanded (`singleEvents: true`), so each instance can be labeled.
- Requires write access on the primary calendar; label assignment needs at least `writerWithoutPrivateAccess`.
