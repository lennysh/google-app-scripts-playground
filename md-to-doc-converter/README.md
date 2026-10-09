# Markdown → Google Doc converter

Converts `.md` files in a Google Drive folder into Google Docs using Drive’s
**native Markdown import** (same engine as “Open with Google Docs”), then embeds
images from a sibling `attachments/` folder when Markdown image links resolve to
files there.

Useful for bulk-migrating Markdown exports (notes with local image paths) into
Drive Docs you can share and edit—without re-implementing Markdown parsing.

## What it does

1. Opens the Drive folder identified by `FOLDER_ID`.
2. Looks for a subfolder named `attachments` (optional but needed for images).
3. For each `.md` file at the folder root:
   - Scans `![alt](path)` image references and logs found vs missing basenames.
   - In live mode:
     - `Drive.Files.copy` with `mimeType: GOOGLE_DOCS` (native MD → Doc).
     - Fixes images: replaces broken inline placeholders in order, and any
       leftover `![alt](path)` text, using blobs from `attachments/`.
     - Archives the `.md` under `Archived_MD_Files/`.
4. Dry-run mode only logs what would happen; it creates neither Docs nor archives.

## Expected folder layout

```
Your Drive folder/          ← FOLDER_ID
├── notes.md
├── other-export.md
└── attachments/
    ├── screenshot.png
    └── diagram.jpg
```

Image paths in Markdown may include folders or URL encoding
(`attachments/foo%20bar.png`); the script uses the **basename only** and looks
it up under `attachments/`.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`).
3. Enable **Services → Drive API** (Advanced service, symbol `Drive`, v3).
4. Put `.md` files (and an `attachments/` folder if needed) in a Drive folder.
5. Set `FOLDER_ID` to that folder’s ID (from the Drive URL: `.../folders/<FOLDER_ID>`).
6. Keep `DRY_RUN = true`, run `convertMdToDocsWithImages`, review **Executions** / logs.
7. Set `DRY_RUN = false` when the preview looks right, then run again.

If you previously used the hand-rolled parser, put originals back from
`Archived_MD_Files/` (or re-copy sources), remove old Docs, and convert fresh.
Do not run `Format.gs` (retired).

## Config reference

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = create Docs, fix images, archive `.md` |
| `FOLDER_ID` | placeholder | Drive folder containing the Markdown files |

## Formatting and images

| Concern | Who handles it |
|---------|----------------|
| Headings, lists, checklists, code, links, etc. | Drive’s native Markdown → Docs importer |
| `![alt](path)` images from `attachments/` | Post-pass in this script (basename lookup) |

Missing attachments become a `[Image missing: filename]` placeholder.
Nested folders under `attachments/` are not searched. Remote image URLs are not downloaded.

## Files

| File | Role |
|------|------|
| `Code.gs` | Config + `convertMdToDocsWithImages` (native convert + image fixup) |
| `appsscript.js` | Manifest: Drive + Documents scopes, Drive Advanced Service v3, V8 |
| `Format.gs` | Deprecated stub (throws if run) |

## Notes

- Prefer a dry-run first so missing images show up in logs before anything is moved.
- Live mode moves original `.md` files into `Archived_MD_Files/` (created if needed).
  Re-running after a live conversion will not reprocess archived files unless you
  move them back to the folder root.
- Do not commit a real `FOLDER_ID` if this repo is public.
- Project timezone in the manifest is `America/New_York` (not used by this script’s logic).
