# Markdown → Google Doc converter

Converts `.md` files in a Google Drive folder into Google Docs, embedding images from a sibling `attachments/` folder when Markdown image links resolve to files there.

Useful for bulk-migrating Markdown exports (for example notes with local image paths) into Drive Docs you can share and edit.

## What it does

1. Opens the Drive folder identified by `FOLDER_ID`.
2. Looks for a subfolder named `attachments` (optional but needed for images).
3. For each `.md` file at the folder root:
   - Scans `![alt](path)` image references and reports found vs missing basenames in the logs.
   - In live mode: creates a Google Doc with the same base name, maps `#` / `##` / `###` to Doc headings, inserts matching images (or a missing-image placeholder paragraph), moves the Doc into the source folder, and archives the `.md` under `Archived_MD_Files/`.
4. Dry-run mode only logs what would happen; it creates neither Docs nor archive folders.

## Expected folder layout

```
Your Drive folder/          ← FOLDER_ID
├── notes.md
├── other-export.md
└── attachments/
    ├── screenshot.png
    └── diagram.jpg
```

Image paths in Markdown may include folders or URL encoding (`attachments/foo%20bar.png`); the script uses the **basename only** and looks it up under `attachments/`.

## Setup

1. Create a new Apps Script project and paste `Code.gs`.
2. Apply the manifest from `appsscript.js` (as `appsscript.json`). Required scopes: Drive + Documents.
3. Put `.md` files (and an `attachments/` folder if needed) in a Drive folder.
4. Set `FOLDER_ID` to that folder’s ID (from the Drive URL: `.../folders/<FOLDER_ID>`).
5. Keep `DRY_RUN = true`, run `convertMdToDocsWithImages`, and review **Executions** / logs (image found/missing counts).
6. Set `DRY_RUN = false` when the preview looks right, then run again.

## Config reference

| Setting | Default | Meaning |
|---------|---------|---------|
| `DRY_RUN` | `true` | `true` = log only; `false` = create Docs and archive `.md` files |
| `FOLDER_ID` | placeholder | Drive folder containing the Markdown files |

## Supported Markdown (subset)

| Syntax | Result in Google Doc |
|--------|----------------------|
| `#` / `##` / `###` headings | Heading 1–3 |
| `![alt](path/to/image.png)` | Embedded image if basename exists in `attachments/`; otherwise a placeholder paragraph |
| Other lines | Plain paragraphs (no bold/italic/lists/tables/links) |

Only one image match per line is handled (`!\[(.*?)\]\((.*?)\)`). Nested folders under `attachments/` are not searched.

## Files

| File | Role |
|------|------|
| `Code.gs` | Config + `convertMdToDocsWithImages` |
| `appsscript.js` | Manifest: Drive + Documents OAuth scopes, V8 runtime |

## Notes

- Prefer a dry-run first so missing images and unexpected filenames show up in logs before anything is moved.
- Live mode moves original `.md` files into `Archived_MD_Files/` (created if needed). Re-running after a live conversion will not reprocess archived files unless you move them back to the folder root.
- Do not commit a real `FOLDER_ID` if this repo is public.
- Project timezone in the manifest is `America/New_York` (not used by this script’s logic).
