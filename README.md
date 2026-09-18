# Google Apps Script Playground

Small, self-contained [Google Apps Script](https://developers.google.com/apps-script) projects for Calendar automation.

Each folder is a standalone script you can paste into a new Apps Script project (or deploy with [clasp](https://github.com/google/clasp)).

## Projects

| Project | Purpose |
|---------|---------|
| [shared-cal-invite-sync](./shared-cal-invite-sync/) | Mirror selected events from shared calendars onto your primary calendar |
| [dynamic-calendar-invite](./dynamic-calendar-invite/) | Pick a low-conflict time slot for a shared-calendar event using FreeBusy |

## Quick start

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Copy `Code.gs` from the project folder into the editor.
3. Replace the editor's manifest with the contents of `appsscript.js` (File → Project settings → Show `appsscript.json`, or paste via clasp as `appsscript.json`).
4. Edit the config placeholders (`YOUR_*_CALENDAR_ID`, event titles/keywords).
5. Run once with `DRY_RUN` left `true`, review the logs, then set it to `false` when ready.

### Finding a calendar ID

In Google Calendar: open the calendar's settings → **Integrate calendar** → **Calendar ID**  
(usually looks like `…@group.calendar.google.com` or `…@resource.calendar.google.com`).

## Safety notes

- Scripts ship with **dry-run enabled** so a first run only logs intended changes.
- Do not commit real calendar IDs, attendee lists, or org-specific meeting names if this repo is public.
- Paths matching `ignore_*` are gitignored (local scratch / archives).

## License

Use and adapt freely for your own calendars.
