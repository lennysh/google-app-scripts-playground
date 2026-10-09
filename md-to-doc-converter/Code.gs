/**
 * Convert Markdown files in a Drive folder into Google Docs.
 *
 * Uses Drive’s native Markdown → Google Doc import (same as “Open with
 * Google Docs”), then embeds images from attachments/ by basename.
 *
 * Expected layout under FOLDER_ID:
 *   - *.md files at the folder root
 *   - attachments/ — image files referenced by Markdown image syntax
 *
 * Live mode creates a Doc per .md file, fixes images, moves the Doc into the
 * source folder (via parents on copy), and archives the .md under
 * Archived_MD_Files/.
 *
 * Requires Advanced Google Service "Drive API" (Drive) v3 — see appsscript.js.
 */

// --- CONFIGURATION ---
const DRY_RUN = true;

// Drive folder ID that contains the .md files (and optional attachments/ subfolder).
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

/**
 * Scan FOLDER_ID for .md files, dry-run image stats, or convert via Drive + fix images.
 */
function convertMdToDocsWithImages() {
  const sourceFolder = DriveApp.getFolderById(FOLDER_ID);

  const attachmentFolders = sourceFolder.getFoldersByName('attachments');
  const attachmentsFolder = attachmentFolders.hasNext() ? attachmentFolders.next() : null;

  const archiveFolderName = 'Archived_MD_Files';
  const archiveFolders = sourceFolder.getFoldersByName(archiveFolderName);
  let archiveFolder = archiveFolders.hasNext() ? archiveFolders.next() : null;

  const files = sourceFolder.getFiles();

  console.log(
    `--- STARTING ${DRY_RUN ? '[DRY RUN MODE - No changes will be made]' : '[LIVE CONVERSION MODE]'} ---`
  );

  if (!attachmentsFolder) {
    console.warn('Warning: No "attachments" subfolder was found in the target directory.');
  }

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();

    if (!fileName.toLowerCase().endsWith('.md')) continue;

    const docName = fileName.replace(/\.md$/i, '');
    const mdText = file.getBlob().getDataAsString();
    const refs = extractImageRefs(mdText);
    const imageStats = summarizeImageRefs(refs, attachmentsFolder);

    const missingDetails =
      imageStats.missingList.length > 0
        ? ` | Missing: [${imageStats.missingList.join(', ')}]`
        : '';

    console.log(
      `${DRY_RUN ? '[DRY RUN] Would convert' : 'Converting'}: "${fileName}" ` +
        `-> Images ${imageStats.found}/${imageStats.total}` +
        (imageStats.missing > 0 ? ` (missing ${imageStats.missing})` : '') +
        missingDetails
    );

    if (DRY_RUN) continue;

    // Native MD → Google Doc (same importer as “Open with Google Docs”).
    const copied = Drive.Files.copy(
      {
        name: docName,
        mimeType: MimeType.GOOGLE_DOCS,
        parents: [FOLDER_ID],
      },
      file.getId(),
      { supportsAllDrives: true }
    );

    fixImagesInDoc(copied.id, mdText, attachmentsFolder);

    if (!archiveFolder) {
      archiveFolder = sourceFolder.createFolder(archiveFolderName);
    }
    file.moveTo(archiveFolder);
  }

  console.log(
    `--- FINISHED ${DRY_RUN ? '[DRY RUN MODE]' : '[LIVE CONVERSION MODE]'} ---`
  );
}

/**
 * Parse all ![alt](path) references from Markdown in document order.
 */
function extractImageRefs(mdText) {
  const refs = [];
  const re = /!\[(.*?)\]\((.*?)\)/g;
  let m;
  while ((m = re.exec(mdText)) !== null) {
    refs.push({
      alt: m[1],
      path: m[2],
      basename: basenameFromImagePath(m[2]),
    });
  }
  return refs;
}

function summarizeImageRefs(refs, attachmentsFolder) {
  let found = 0;
  let missing = 0;
  const missingList = [];

  for (let i = 0; i < refs.length; i++) {
    const name = refs[i].basename;
    if (attachmentsFolder && attachmentsFolder.getFilesByName(name).hasNext()) {
      found++;
    } else {
      missing++;
      missingList.push(name);
    }
  }

  return {
    total: refs.length,
    found: found,
    missing: missing,
    missingList: missingList,
  };
}

function basenameFromImagePath(imagePath) {
  let imageName = String(imagePath).split('/').pop().split('#')[0].split('?')[0];
  try {
    imageName = decodeURIComponent(imageName);
  } catch (e) {
    // keep original
  }
  return imageName;
}

function getAttachmentBlob(attachmentsFolder, basename) {
  if (!attachmentsFolder) return null;
  const files = attachmentsFolder.getFilesByName(basename);
  if (!files.hasNext()) return null;
  return files.next().getBlob();
}

/**
 * After native import, embed attachments/ images:
 * 1) Replace inline image placeholders in document order (matched to MD refs).
 * 2) Replace any leftover ![alt](path) text with embedded images.
 */
function fixImagesInDoc(docId, mdText, attachmentsFolder) {
  const refs = extractImageRefs(mdText);
  if (refs.length === 0) return;

  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  // Snapshot import leftovers before we insert any new images.
  const importImages = body.getImages();
  if (importImages.length > 0) {
    replaceInlineImagesInOrder(importImages, refs, attachmentsFolder);
  }

  replaceMarkdownImageSyntax(body, attachmentsFolder);

  doc.saveAndClose();
}

/**
 * Replace existing InlineImages (typically broken after MD import) with
 * attachment blobs, matched by document order to MD ![ ]( ) refs.
 */
function replaceInlineImagesInOrder(images, refs, attachmentsFolder) {
  const count = Math.min(images.length, refs.length);

  // Bottom-up so sibling indexes stay valid while removing/inserting.
  for (let i = count - 1; i >= 0; i--) {
    const img = images[i];
    const ref = refs[i];
    const blob = getAttachmentBlob(attachmentsFolder, ref.basename);
    const parent = img.getParent();
    if (!parent) continue;

    const childIndex = parent.getChildIndex(img);
    img.removeFromParent();

    if (blob) {
      insertInlineImage(parent, childIndex, blob);
    } else {
      insertPlainText(parent, childIndex, `[Image missing: ${ref.basename}]`);
    }
  }

  if (images.length > refs.length) {
    console.warn(
      `Doc has ${images.length} inline images but MD has ${refs.length} refs; extras left unchanged`
    );
  }
}

/**
 * Find leftover Markdown image syntax and replace each with an embedded image.
 */
function replaceMarkdownImageSyntax(body, attachmentsFolder) {
  const pattern = '!\\[[^\\]]*\\]\\([^\\)]+\\)';
  let found = body.findText(pattern);

  while (found) {
    const el = found.getElement().asText();
    const start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    const matchStr = el.getText().substring(start, end + 1);
    const m = matchStr.match(/!\[(.*?)\]\((.*?)\)/);

    if (!m) {
      found = body.findText(pattern, found);
      continue;
    }

    const basename = basenameFromImagePath(m[2]);
    const blob = getAttachmentBlob(attachmentsFolder, basename);
    const parent = el.getParent();
    const textIdx = parent ? parent.getChildIndex(el) : 0;

    el.deleteText(start, end);

    // Insert on the parent paragraph/list item at the text element's index
    // (typical notes exports put each image on its own line).
    if (blob) {
      if (parent) {
        insertInlineImage(parent, textIdx, blob);
      } else {
        body.appendImage(blob);
      }
    } else if (parent) {
      insertPlainText(parent, textIdx, `[Image missing: ${basename}]`);
    } else {
      body.appendParagraph(`[Image missing: ${basename}]`);
    }

    // Search from the top again; offsets shifted after edits.
    found = body.findText(pattern);
  }
}

function insertInlineImage(parent, childIndex, blob) {
  const type = parent.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH) {
    parent.asParagraph().insertInlineImage(childIndex, blob);
  } else if (type === DocumentApp.ElementType.LIST_ITEM) {
    parent.asListItem().insertInlineImage(childIndex, blob);
  } else {
    // Fallback: append to body after parent if possible.
    const body = parent.getParent();
    if (body && body.getType() === DocumentApp.ElementType.BODY_SECTION) {
      const idx = body.getChildIndex(parent);
      body.insertImage(idx + 1, blob);
    }
  }
}

function insertPlainText(parent, childIndex, text) {
  const type = parent.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH) {
    parent.asParagraph().insertText(childIndex, text);
  } else if (type === DocumentApp.ElementType.LIST_ITEM) {
    parent.asListItem().insertText(childIndex, text);
  }
}
