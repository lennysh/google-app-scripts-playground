# Meeting notes → email draft (Word)

After Google Meet / Gemini finishes a notes Doc for a meeting, this script finds the Calendar event, matches it to a **customer profile** by attendee email or domain, exports the notes as `.docx`, and creates a Gmail **draft** (or sends) with the Word file attached.

Useful when you want Gemini meeting notes delivered to customers in Word format without manually exporting and composing each time.

## What it does

1. Lists recently ended events on your Calendar (within `lookbackHours`, older than `minAgeMinutes`).
2. Matches each event to the first `CONFIG.customers` profile whose `watchAttendees` / `watchDomains` hit an invitee (or organizer).
3. Resolves the notes Google Doc — prefer Calendar attachments; fall back to Docs under Meet recording folders near the event end time.
4. Exports the Doc to Word via Drive API `files.export`.
5. Builds a multipart MIME message (HTML + plain + attachment) and either creates a Gmail draft or sends, per `deliveryMode`.
6. Remembers processed event/doc pairs in Script Properties so the same notes are not emailed twice.

## Setup

1. Create a new Apps Script project.
2. Paste each file into the editor:
   - `Code.gs` — main logic
   - `Config.gs` — customers, templates, timing
   - `Setup.gs` — authorize, triggers, debug helpers
3. Apply the manifest from `appsscript.js` (as `appsscript.json`).
4. In the Apps Script editor, enable advanced services (Services → add):
   - **Calendar API**
   - **Gmail API**
   The manifest already declares both.
5. Edit `Config.gs`:
   - Set `fromName` and the email body sign-off.
   - Replace the sample `customers` entry with your real watch lists and `to` / `cc` addresses.
   - Keep `deliveryMode: 'draft'` until you trust the matches.
6. Run `authorizeOnce` from `Setup.gs` and approve the OAuth prompts.
7. Run `dryRunListMatchingEvents` or `dryRunProcessNewMeetingNotes`, review **Executions** / logs.
8. When ready, run `setupTrigger` (15-minute time-driven) or call `processNewMeetingNotes` manually.

### Finding Meet note folders

Run `listMeetFolders` to confirm Drive can see folders named like `Meet Recordings` / `Google Meet`. Adjust `meetFolderNames` if your account uses different folder titles.

## Config reference

| Key | Meaning |
|-----|---------|
| `deliveryMode` | `'draft'` (review in Gmail) or `'send'` |
| `bcc` | Optional BCC on every message |
| `fromName` | Display name on the From header |
| `minAgeMinutes` | Wait after event end before exporting (gives Gemini time) |
| `lookbackHours` | How far back to scan ended events |
| `calendarId` | Usually `'primary'` |
| `meetFolderNames` | Drive folder names for fallback Doc discovery |
| `driveFallbackWindowMinutes` | Max age of a Meet-folder Doc relative to event end |
| `customers[]` | Profiles: `id`, `name`, `watchAttendees`, `watchDomains`, `to`, `cc` |
| `subjectTemplate` / `bodyTemplate` / `htmlBodyTemplate` | Placeholders: `{{title}}`, `{{when}}` |
| `maxEmailsPerRun` | Cap deliveries per trigger run |
| `processedPropertyKey` | Script Properties key for dedupe IDs |

### Customer matching

A profile matches when **any** attendee (or organizer) email is in `watchAttendees` **or** the email’s domain is in `watchDomains`. First matching profile wins.

## Helper functions

| Function | Role |
|----------|------|
| `processNewMeetingNotes` | Main job (use with a trigger) |
| `dryRunProcessNewMeetingNotes` | Log matches / resolve notes without emailing |
| `dryRunListMatchingEvents` | Log matching events only |
| `authorizeOnce` | Force OAuth consent for Drive, Calendar, Gmail |
| `setupTrigger` / `removeTrigger` | Install or clear the 15-minute trigger |
| `listCustomers` / `listMeetFolders` | Print config / Drive folder IDs |
| `clearProcessedIds` | Reset dedupe history |
| `sendDocById(docId, customerIdOrToList)` | Manual export + deliver for one Doc |

## Files

| File | Role |
|------|------|
| `Code.gs` | Calendar scan, Doc resolve, Word export, Gmail MIME deliver |
| `Config.gs` | Customers, templates, timing, delivery mode |
| `Setup.gs` | Auth, triggers, dry-run / list helpers |
| `appsscript.js` | Manifest: Calendar + Gmail advanced services and OAuth scopes |

## Notes

- Default `deliveryMode` is **`draft`** so the first real runs only create drafts.
- Do not commit real customer emails, domains, or personal BCC addresses if this repo is public.
- Gemini notes must be a Google Doc (Calendar attachment or Meet-folder fallback). Non-Doc attachments are skipped.
- Gmail’s simple draft helpers often drop HTML when attachments are present; this project builds raw MIME via the Gmail API instead.
- Project timezone in the manifest is `America/New_York`; change it if `{{when}}` should use another zone.
