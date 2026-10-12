# Tag aggregator

Scans Google Drive folders of dated Google Docs (and optional explicit Doc IDs)
for configured tags, then writes a summary into a destination Doc — grouped by
**tag**, then by **group label** (account / folder / custom).

Useful for quarterly or yearly rollups (or any date window) when notes are
tagged in-line (for example `#theme/wins`) and live in per-account folders.

## What it does

1. For each entry in `CONFIG.folders`, lists Google Docs in that Drive folder.
2. Keeps only folder files whose **name** starts with `YYYY-MM-DD` or
   `YYYY.MM.DD` and falls within `startDate`…`endDate` (inclusive, script-local).
3. Also opens every Doc listed in `CONFIG.documents` (no date filter).
4. Finds paragraphs containing any configured tag.
5. Dry-run: logs hits only. Live mode: writes to `targetDocId`
   (optionally clearing it first), then:
   - H1: `reportTitle` + date range
   - H2: tag display label
   - H3: group label (folder key and/or documents key)
   - Bullets: linked source Doc name — snippet with tags stripped

## Expected inputs

**Filenames** (folder scan) must start with a date; the rest of the name is ignored:

```
2026-07-15 Account sync notes
2026.08.01 Weekly check-in
```

**Body text** includes tags as plain substrings (anywhere in a paragraph):

```
Shipped the onboarding playbook #theme/wins
Customer asked for SSO timeline #theme/risks
```

**Sources**

| Source | Config | Date filter |
|--------|--------|-------------|
| Drive folders | `folders` | Yes — leading filename date in range |
| Specific Docs | `documents` | No — always scanned |

Only Google Docs at the top level of each folder are scanned (not subfolders).

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. Create (or pick) a destination Google Doc for the summary; copy its ID into
   `CONFIG.targetDocId`.
4. For each source folder, copy the folder ID into `CONFIG.folders` with a
   display label (account name, team, etc.).
5. Optionally add specific Doc IDs under `CONFIG.documents` (same label as a
   folder to merge, or a new label for a standalone section).
6. Set `tags`, `reportTitle`, and the date range (`localDate(year, month, day)`
   — months are 1–12).
7. Keep `DRY_RUN = true`, run `runTagAggregator`, review **Executions** / logs.
8. Set `DRY_RUN = false` when the preview looks right, then run again.

By default live mode **clears** the destination Doc body, then writes a fresh
summary. Set `clearDestination: false` to append instead.

### Example: folders + extra Docs

```javascript
folders: {
  'Example Account': 'YOUR_FOLDER_ID'
},
documents: {
  // Merge into the same H3 as the folder above:
  'Example Account': 'YOUR_EXTRA_DOC_ID',
  // Or a standalone section:
  'Shared notes': ['YOUR_DOC_ID_1', 'YOUR_DOC_ID_2']
}
```

## Config reference

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = write summary to the Doc |
| `targetDocId` | placeholder | Destination Google Doc ID |
| `clearDestination` | `true` | `true` = wipe Doc body before write; `false` = append |
| `reportTitle` | `'Review'` | H1 prefix (e.g. `'Q3 Review'`, `'2026 Annual Review'`) |
| `startDate` / `endDate` | example quarter | Inclusive filename-date window for **folder** scans |
| `tags` | example map | Tag string → heading label in the output Doc |
| `folders` | placeholders | Display name → Drive folder ID to scan |
| `documents` | `{}` | Display name → Doc ID string or array of Doc IDs |

## Output shape

```
Review: 7/1/2026 to 9/30/2026          ← H1 (reportTitle + range)
Wins                                   ← H2 (tag display label)
  Example Account                      ← H3
    • 2026-07-15 Notes — Shipped …     ← bullet; filename links to source Doc
Risks
  Shared notes
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
- Filename dates (folder scan) and CONFIG dates are compared in the script
  timezone (`America/New_York` in the manifest).
- Explicit `documents` entries are always scanned, even without a dated filename.
- A paragraph that contains several configured tags is recorded under each
  matching tag (same snippet, tags stripped).
- Only the top level of each folder is scanned; nested folders are ignored.
- Do not commit real `targetDocId`, folder IDs, or Doc IDs if this repo is public.
