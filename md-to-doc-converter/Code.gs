/**
 * Convert Markdown files in a Drive folder into Google Docs.
 *
 * Expected layout under FOLDER_ID:
 *   - *.md files at the folder root
 *   - attachments/ — image files referenced by Markdown image syntax
 *
 * Live mode creates a Doc per .md file, moves it into the source folder,
 * and archives the original Markdown under Archived_MD_Files/.
 */

// --- CONFIGURATION ---
// Set to true to inspect files and test image paths without making any changes.
// Set to false to run the actual conversion, create Docs, and archive .md files.
const DRY_RUN = true;

// Drive folder ID that contains the .md files (and optional attachments/ subfolder).
// From Drive: open the folder → copy the ID from the URL (.../folders/<FOLDER_ID>).
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

/**
 * Scan FOLDER_ID for .md files, resolve images under attachments/, then either
 * log a dry-run summary or convert each file to a Google Doc.
 */
function convertMdToDocsWithImages() {
  const sourceFolder = DriveApp.getFolderById(FOLDER_ID);

  // Images are looked up by basename only (path prefixes in Markdown are ignored).
  const attachmentFolders = sourceFolder.getFoldersByName('attachments');
  const attachmentsFolder = attachmentFolders.hasNext() ? attachmentFolders.next() : null;

  // Created on first live run when at least one .md is converted.
  const archiveFolderName = 'Archived_MD_Files';
  const archiveFolders = sourceFolder.getFoldersByName(archiveFolderName);
  let archiveFolder = archiveFolders.hasNext() ? archiveFolders.next() : null;

  const files = sourceFolder.getFiles();

  console.log(`--- STARTING ${DRY_RUN ? '[DRY RUN MODE - No changes will be made]' : '[LIVE CONVERSION MODE]'} ---`);

  if (!attachmentsFolder) {
    console.warn('Warning: No "attachments" subfolder was found in the target directory.');
  }

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();

    if (fileName.toLowerCase().endsWith('.md')) {
      const docName = fileName.replace(/\.md$/i, '');
      const text = file.getBlob().getDataAsString();
      const lines = text.split('\n');

      let totalImages = 0;
      let foundImages = 0;
      let missingImages = 0;
      const missingList = [];

      // Preview pass: count image refs and whether each basename exists in attachments/.
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);

        if (imageMatch) {
          totalImages++;
          const imagePath = imageMatch[2];

          // Basename only; decode %20; strip #anchors and ?queries.
          let imageName = imagePath.split('/').pop().split('#')[0].split('?')[0];
          try {
            imageName = decodeURIComponent(imageName);
          } catch (e) {
            // Keep original name if decoding fails
          }

          if (attachmentsFolder && attachmentsFolder.getFilesByName(imageName).hasNext()) {
            foundImages++;
          } else {
            missingImages++;
            missingList.push(imageName);
          }
        }
      }

      const missingDetails = missingList.length > 0 ? ` | Missing files: [${missingList.join(', ')}]` : '';
      console.log(
        `${DRY_RUN ? '[DRY RUN] Would convert' : 'Converting'}: "${fileName}" ` +
        `-> Images Total: ${totalImages} | Found: ${foundImages} | Missing: ${missingImages}${missingDetails}`
      );

      if (!DRY_RUN) {
        const newDoc = DocumentApp.create(docName);
        const body = newDoc.getBody();
        body.clear();

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trimEnd();
          const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);

          if (imageMatch) {
            const imagePath = imageMatch[2];
            let imageName = imagePath.split('/').pop().split('#')[0].split('?')[0];
            try {
              imageName = decodeURIComponent(imageName);
            } catch (e) {}

            if (attachmentsFolder) {
              const imgFiles = attachmentsFolder.getFilesByName(imageName);
              if (imgFiles.hasNext()) {
                const imgBlob = imgFiles.next().getBlob();
                body.appendImage(imgBlob);
              } else {
                body.appendParagraph(`[Image missing: ${imageName}]`);
              }
            } else {
              body.appendParagraph(`[Attachments folder not found for: ${imageName}]`);
            }
          }
          // Basic Markdown headings only (# / ## / ###); other lines become plain paragraphs.
          else if (line.startsWith('# ')) {
            body.appendParagraph(line.substring(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
          } else if (line.startsWith('## ')) {
            body.appendParagraph(line.substring(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
          } else if (line.startsWith('### ')) {
            body.appendParagraph(line.substring(4)).setHeading(DocumentApp.ParagraphHeading.HEADING3);
          } else {
            body.appendParagraph(line);
          }
        }

        newDoc.saveAndClose();

        // DocumentApp.create() lands in Drive root; move into the source folder.
        const docFile = DriveApp.getFileById(newDoc.getId());
        docFile.moveTo(sourceFolder);

        if (!archiveFolder) {
          archiveFolder = sourceFolder.createFolder(archiveFolderName);
        }
        file.moveTo(archiveFolder);
      }
    }
  }

  console.log(`--- FINISHED ${DRY_RUN ? '[DRY RUN MODE]' : '[LIVE CONVERSION MODE]'} ---`);
}
