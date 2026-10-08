# Google Apps Script Playground

Small, self-contained [Google Apps Script](https://developers.google.com/apps-script) projects for Calendar, Drive, and Gmail automation.

Each folder is a standalone script you can paste into a new Apps Script project (or deploy with [clasp](https://github.com/google/clasp)).

## Projects

| Project | Purpose |
|---------|---------|
| [shared-cal-invite-sync](./shared-cal-invite-sync/) | Mirror selected events from shared calendars onto your primary calendar |
| [dynamic-calendar-invite](./dynamic-calendar-invite/) | Pick a low-conflict time slot for a shared-calendar event using FreeBusy |
| [calendar-label-by-name](./calendar-label-by-name/) | Assign Calendar Labels on the primary calendar by matching event titles |
| [meeting-notes-to-email-draft-in-word-format](./meeting-notes-to-email-draft-in-word-format/) | Export Gemini Meet notes to Word and draft/send email by Calendar attendee |
| [md-to-doc-converter](./md-to-doc-converter/) | Convert Drive-folder Markdown (with `attachments/` images) into Google Docs |

## Quick start

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Copy each `.gs` file from the project folder into the editor (multi-file projects keep the same filenames).
3. Replace the editor's manifest with the contents of `appsscript.js` (File → Project settings → Show `appsscript.json`, or paste via clasp as `appsscript.json`).
4. Edit config placeholders (calendar IDs, customer emails, event titles/keywords, display names).
5. Prefer a dry-run / draft-first pass, review the logs, then enable live send or writes when ready.

### Finding a calendar ID

In Google Calendar: open the calendar's settings → **Integrate calendar** → **Calendar ID**  
(usually looks like `…@group.calendar.google.com` or `…@resource.calendar.google.com`).

## Safety notes

- Prefer dry-run or draft-only modes on the first run so nothing is sent or mutated unexpectedly.
- Do not commit real calendar IDs, attendee lists, customer emails, or org-specific meeting names if this repo is public.
- Paths matching `ignore_*` are gitignored (local scratch / archives).

## License

Use and adapt freely for your own calendars and workflows.
