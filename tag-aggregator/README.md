# Tag aggregator

Scans Google Drive folders of dated Google Docs (and optional explicit Doc IDs)
for configured tags, then writes a summary into a destination Doc — grouped by
**tag**, then by **group label** (account / folder / custom).

Useful for quarterly or yearly rollups (or any date window) when notes are
tagged in-line (for example `#theme/wins`) and live in per-account folders.

Configuration lives in **`Config.gs`**: shared settings plus named **periods**
(batches) so you can keep Q1–Q4 (or years, halves, etc.) without duplicating
tags and folders.

## What it does

1. Loads config via `buildConfig()` (`SHARED` + the selected period).
2. For each entry in `folders`, lists Google Docs in that Drive folder.
3. Keeps only folder files whose **name** starts with `YYYY-MM-DD` or
   `YYYY.MM.DD` and falls within the period’s `startDate`…`endDate`.
4. Also opens every Doc listed in that period’s `documents` (no date filter).
5. Finds paragraphs containing any configured tag.
6. Dry-run: logs hits only. Live mode: writes to the period’s `targetDocId`
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
| Drive folders | `SHARED.folders` | Yes — leading filename date in period range |
| Specific Docs | `PERIODS[…].documents` | No — always scanned |

Only Google Docs at the top level of each folder are scanned (not subfolders).

## Setup

1. Create a new Apps Script project and paste `Config.gs` and `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. Edit `Config.gs`:
   - `SHARED.folders` — account label → Drive folder ID
   - `SHARED.tags` — tag string → heading label
   - `PERIODS` — at least one period with dates, `targetDocId`, optional `documents`
   - `ACTIVE_PERIOD` — which period key to run by default
4. Keep `SHARED.DRY_RUN = true`, run `runTagAggregator`, review **Executions** / logs.
5. Optionally run `listPeriods` to confirm configured batches.
6. Set `SHARED.DRY_RUN = false` when the preview looks right, then run again.

By default live mode **clears** the destination Doc body, then writes a fresh
summary. Set `SHARED.clearDestination = false` to append instead.

### Periods (quarters, years, …)

Put stable settings in `SHARED`. Put per-batch fields in `PERIODS`:

| Field | Where | Example |
|-------|--------|---------|
| `tags`, `folders` | `SHARED` | Same all year |
| `DRY_RUN`, `clearDestination` | `SHARED` | |
| `reportTitle`, dates | each period | `'Q3 2026 Review'` |
| `targetDocId` | each period | One summary Doc per quarter |
| `documents` | each period | One manual Doc ID per account per quarter |

```javascript
const ACTIVE_PERIOD = '2026-Q3';

const PERIODS = {
  '2026-Q3': {
    reportTitle: 'Q3 2026 Review',
    startDate: localDate(2026, 7, 1),
    endDate: localDate(2026, 9, 30),
    targetDocId: 'YOUR_Q3_SUMMARY_DOC_ID',
    documents: {
      'Example Account': 'YOUR_Q3_ACCOUNT_DOC_ID',
      'Another Account': 'YOUR_Q3_ACCOUNT_DOC_ID'
    }
  }
  // Add '2026-Q1', '2026-Q2', '2026-Q4', or '2026' as needed
};
```

Day-to-day: flip `ACTIVE_PERIOD` (or call `runTagAggregator('2026-Q1')` from a
custom wrapper) and update that period’s Doc IDs. Prefer keys like `2026-Q1`
so next year does not collide with `Q1`.

### Example: folders + extra Docs in a period

```javascript
// SHARED
folders: {
  'Example Account': 'YOUR_FOLDER_ID'
},

// PERIODS['2026-Q3']
documents: {
  // Merge into the same H3 as the folder above:
  'Example Account': 'YOUR_EXTRA_DOC_ID',
  // Or a standalone section:
  'Shared notes': ['YOUR_DOC_ID_1', 'YOUR_DOC_ID_2']
}
```

## Config reference

### `SHARED`

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = write summary to the Doc |
| `clearDestination` | `true` | `true` = wipe Doc body before write; `false` = append |
| `tags` | example map | Tag string → heading label in the output Doc |
| `folders` | placeholders | Display name → Drive folder ID to scan |

### Each `PERIODS` entry

| Setting | Meaning |
|---------|---------|
| `reportTitle` | H1 prefix (e.g. `'Q3 Review'`, `'2026 Annual Review'`) |
| `startDate` / `endDate` | Inclusive filename-date window for **folder** scans (`localDate`) |
| `targetDocId` | Destination Google Doc ID for this period |
| `documents` | Display name → Doc ID string or array of Doc IDs (optional) |

### Other

| Symbol | Meaning |
|--------|---------|
| `ACTIVE_PERIOD` | Default `PERIODS` key for `runTagAggregator()` |
| `buildConfig(id)` | Merges `SHARED` + period (used by the engine) |
| `listPeriods()` | Logs configured period ids and date ranges |

## Output shape

```
Q3 2026 Review: 7/1/2026 to 9/30/2026  ← H1 (reportTitle + range)
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
| `Config.gs` | `SHARED`, `PERIODS`, `ACTIVE_PERIOD`, `buildConfig`, `listPeriods` |
| `Code.gs` | Engine — `runTagAggregator(periodId?)` |
| `appsscript.js` | Manifest: Drive + Documents scopes, V8 |

## Notes

- Prefer a dry-run first. With `clearDestination: true`, a live run wipes the
  destination Doc body before writing — keep that Doc dedicated to the summary.
- Use `localDate(y, m, d)` for period dates. Do **not** use
  `new Date('YYYY-MM-DD')` — that is UTC midnight and can shift the day.
- Filename dates (folder scan) and period dates are compared in the script
  timezone (`America/New_York` in the manifest).
- Explicit `documents` entries are always scanned, even without a dated filename.
- A paragraph that contains several configured tags is recorded under each
  matching tag (same snippet, tags stripped).
- Only the top level of each folder is scanned; nested folders are ignored.
- Do not commit real `targetDocId`, folder IDs, or Doc IDs if this repo is public.
