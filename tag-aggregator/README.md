# Tag aggregator

Scans Google Drive folders of dated Google Docs for configured tags, then
writes a summary into a destination Doc — grouped by **tag**, then by
**account/folder label**.

Useful for quarterly or yearly rollups (or any date window) when notes are
tagged in-line (for example `#theme/wins`) and live in per-account folders.

## What it does

1. For each entry in `CONFIG.folders`, lists Google Docs in that Drive folder.
2. Keeps only files whose **name** starts with `YYYY-MM-DD` or `YYYY.MM.DD`
   and falls within `startDate`…`endDate` (inclusive, script-local calendar).
3. Opens each in-range Doc and finds paragraphs containing any configured tag.
4. Dry-run: logs hits only. Live mode: writes to `targetDocId`
   (optionally clearing it first), then:
   - H1: `reportTitle` + date range
   - H2: tag display label
   - H3: account/folder label
   - Bullets: linked source Doc name — snippet with tags stripped

## Expected inputs

**Filenames** must start with a date the rest of the name is ignored:

```
2026-07-15 Account sync notes
2026.08.01 Weekly check-in
```

**Body text** includes tags as plain substrings (anywhere in a paragraph):

```
Shipped the onboarding playbook #theme/wins
Customer asked for SSO timeline #theme/risks
```

**Folder layout** is one Drive folder per account/group (IDs in `CONFIG.folders`).
Only Google Docs in that folder are scanned (not subfolders).

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. Create (or pick) a destination Google Doc for the summary; copy its ID into
   `CONFIG.targetDocId`.
4. For each source folder, copy the folder ID into `CONFIG.folders` with a
   display label (account name, team, etc.).
5. Set `tags`, `reportTitle`, and the date range (`localDate(year, month, day)`
   — months are 1–12).
6. Keep `DRY_RUN = true`, run `runTagAggregator`, review **Executions** / logs.
7. Set `DRY_RUN = false` when the preview looks right, then run again.

By default live mode **clears** the destination Doc body, then writes a fresh
summary. Set `clearDestination: false` to append instead.

## Config reference

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = write summary to the Doc |
| `targetDocId` | placeholder | Destination Google Doc ID |
| `clearDestination` | `true` | `true` = wipe Doc body before write; `false` = append |
| `reportTitle` | `'Review'` | H1 prefix (e.g. `'Q3 Review'`, `'2026 Annual Review'`) |
| `startDate` / `endDate` | example quarter | Inclusive filename-date window via `localDate(y, m, d)` |
| `tags` | example map | Tag string → heading label in the output Doc |
| `folders` | placeholders | Display name → Drive folder ID to scan |

## Output shape

```
Review: 7/1/2026 to 9/30/2026          ← H1 (reportTitle + range)
Wins                                   ← H2 (tag display label)
  Example Account                      ← H3
    • 2026-07-15 Notes — Shipped …     ← bullet; filename links to source Doc
Risks
  Another Account
    • …
```

## Files

| File | Role |
|------|------|
| `Code.gs` | Config + `runTagAggregator` |
| `appsscript.js` | Manifest: Drive + Documents scopes, V8 |

## Notes

- Prefer a dry-run first. With `clearDestination: true`, a live run wipes the
  destination Doc body before writing — keep that Doc dedicated to the summary.
- Use `localDate(y, m, d)` for CONFIG dates. Do **not** use
  `new Date('YYYY-MM-DD')` — that is UTC midnight and can shift the day.
- Filename dates and CONFIG dates are compared in the script timezone
  (`America/New_York` in the manifest).
- A paragraph that contains several configured tags is recorded under each
  matching tag (same snippet, tags stripped).
- Only the top level of each folder is scanned; nested folders are ignored.
- Do not commit real `targetDocId` or folder IDs if this repo is public.
