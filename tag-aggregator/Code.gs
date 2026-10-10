// ==========================================
// 1. CONFIGURATION SETTINGS (Edit these!)
// ==========================================

/**
 * Calendar date in the script timezone (America/New_York). Months are 1–12.
 * Use this for CONFIG dates — do not use new Date('YYYY-MM-DD') (that is UTC).
 * Filenames are compared the same way: "2026-07-01 Notes" means July 1 locally.
 */
function localDate(year, month, day) {
  return new Date(year, month - 1, day);
}

const CONFIG = {
  // true = scan folders and log matches only; false = also write into targetDocId
  DRY_RUN: true,

  // Destination Google Doc ID (from the URL: .../document/d/<ID>/edit).
  // Do not commit a real ID if this repo is public.
  targetDocId: 'YOUR_TARGET_DOC_ID',

  // Heading prefix in the destination Doc (e.g. 'Q3 Review', '2026 Annual Review').
  reportTitle: 'Review',

  // Inclusive range by filename date (YYYY-MM-DD or YYYY.MM.DD). No UTC math.
  startDate: localDate(2026, 7, 1),
  endDate: localDate(2026, 9, 30),

  // Tag → display label used as an H2 in the destination Doc.
  // Keys are the literal substrings matched in source Doc paragraphs.
  tags: {
    '#theme/wins': 'Wins',
    '#theme/risks': 'Risks',
    '#theme/feedback': 'Feedback'
  },

  // Group label → Drive folder ID containing Google Docs to scan.
  // Folder ID is the .../folders/<ID> segment of the Drive URL.
  // Do not commit real folder IDs if this repo is public.
  folders: {
    'Example Account': 'YOUR_FOLDER_ID',
    'Another Account': 'YOUR_FOLDER_ID'
  }
};

// ==========================================
// 2. IMPLEMENTATION
// ==========================================

/**
 * Parse a leading date from a filename: YYYY-MM-DD… or YYYY.MM.DD…
 * Returns a local-midnight Date, or null if the name does not start with either form.
 */
function parseDateFromFileName(fileName) {
  const match = String(fileName).match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Reject impossible calendars (e.g. 2026-13-40 → rolled-over Date)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Format a Date as YYYY-MM-DD in local time (for logs). */
function formatLocalYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Remove configured tag tokens from a line and normalize whitespace. */
function stripTagsFromText(text, tagKeys) {
  let result = String(text);
  for (const tag of tagKeys) {
    // Split/join avoids regex special chars in tags like #
    result = result.split(tag).join('');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Append a bullet whose source doc name is a hyperlink, followed by the snippet.
 * Format: "<Doc Name> — <snippet>"
 */
function appendLinkedListItem(body, fileName, fileUrl, snippet) {
  const label = snippet ? `${fileName} — ${snippet}` : fileName;
  const item = body.appendListItem(label).setGlyphType(DocumentApp.GlyphType.BULLET);
  const text = item.editAsText();
  // Link only the file name portion
  if (fileName.length > 0) {
    text.setLinkUrl(0, fileName.length - 1, fileUrl);
  }
  return item;
}

/**
 * Scan account Drive folders for Docs whose filename date falls in the range
 * and that contain configured tags. Dry-run logs matches; live mode appends
 * a summary to targetDocId grouped by tag, then account.
 *
 * Filename date: leading YYYY-MM-DD or YYYY.MM.DD (rest of the name ignored).
 * Period is whatever CONFIG.startDate / endDate cover (quarter, year, etc.).
 */
function runTagAggregator() {
  const mode = CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE';
  const accountNames = Object.keys(CONFIG.folders);
  const tagKeys = Object.keys(CONFIG.tags);

  console.log(`=== tag-aggregator [${mode}] ===`);
  console.log(
    `Date range: ${formatLocalYmd(CONFIG.startDate)} → ` +
    `${formatLocalYmd(CONFIG.endDate)} (inclusive by filename date YYYY-MM-DD / YYYY.MM.DD)`
  );
  console.log(
    `Tags: ${tagKeys.map(t => `${t} → "${CONFIG.tags[t]}"`).join(', ') || '(none)'}`
  );
  console.log(`Accounts (${accountNames.length}): ${accountNames.join(', ')}`);
  if (CONFIG.DRY_RUN) {
    console.log('Dry-run: destination Doc will NOT be modified.');
  } else {
    console.log(`Live: writing summary into Doc ${CONFIG.targetDocId}`);
  }
  console.log('---');

  // results[tag][accountName] = [{ fileName, fileUrl, snippet }, ...]
  const results = {};
  tagKeys.forEach(tag => {
    results[tag] = {};
    accountNames.forEach(account => {
      results[tag][account] = [];
    });
  });

  let totals = {
    accountsOk: 0,
    accountsFailed: 0,
    filesSeen: 0,
    filesInRange: 0,
    matchLines: 0,
    accountsWithHits: 0
  };

  for (const [accountName, folderId] of Object.entries(CONFIG.folders)) {
    console.log(`\n[Account] ${accountName}  folderId=${folderId}`);

    try {
      const folder = DriveApp.getFolderById(folderId);
      const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);

      let filesSeen = 0;
      let filesInRange = 0;
      let filesSkippedOutOfRange = 0;
      let filesSkippedNoDate = 0;
      let filesWithHits = 0;
      let matchLinesThisAccount = 0;
      const perTagCounts = {};
      tagKeys.forEach(tag => (perTagCounts[tag] = 0));

      while (files.hasNext()) {
        const file = files.next();
        filesSeen++;
        totals.filesSeen++;

        const fileName = file.getName();
        const fileDate = parseDateFromFileName(fileName);

        if (!fileDate) {
          filesSkippedNoDate++;
          console.log(`  skip  "${fileName}"  (no leading YYYY-MM-DD / YYYY.MM.DD date)`);
          continue;
        }

        const inRange = fileDate >= CONFIG.startDate && fileDate <= CONFIG.endDate;
        if (!inRange) {
          filesSkippedOutOfRange++;
          continue;
        }

        filesInRange++;
        totals.filesInRange++;

        const fileUrl = file.getUrl();
        const doc = DocumentApp.openById(file.getId());
        const paragraphs = doc.getBody().getParagraphs();
        let hitsInFile = 0;

        for (let p of paragraphs) {
          const text = p.getText();

          for (let tag of tagKeys) {
            if (text.includes(tag)) {
              const snippet = stripTagsFromText(text, tagKeys);
              results[tag][accountName].push({
                fileName: fileName,
                fileUrl: fileUrl,
                snippet: snippet
              });
              hitsInFile++;
              matchLinesThisAccount++;
              perTagCounts[tag]++;
              totals.matchLines++;
              console.log(`  HIT   tag=${tag}  file="${fileName}"`);
              console.log(
                `        ${snippet.length > 200 ? snippet.slice(0, 200) + '…' : snippet || '(empty after stripping tags)'}`
              );
            }
          }
        }

        if (hitsInFile > 0) {
          filesWithHits++;
          console.log(
            `  ok    "${fileName}"  fileDate=${formatLocalYmd(fileDate)}  hits=${hitsInFile}`
          );
        } else {
          console.log(
            `  none  "${fileName}"  fileDate=${formatLocalYmd(fileDate)}  (in range, no tags)`
          );
        }
      }

      const tagCountStr = tagKeys
        .map(tag => `${tag}=${perTagCounts[tag]}`)
        .join(', ');
      console.log(
        `  summary: filesSeen=${filesSeen} inRange=${filesInRange} ` +
        `skippedOutOfRange=${filesSkippedOutOfRange} skippedNoDate=${filesSkippedNoDate} ` +
        `filesWithHits=${filesWithHits} | ${tagCountStr}`
      );

      if (matchLinesThisAccount > 0) {
        totals.accountsWithHits++;
      } else {
        console.log(`  no matching tagged lines for this account`);
      }

      totals.accountsOk++;
    } catch (e) {
      totals.accountsFailed++;
      console.error(`  ERROR processing ${accountName}: ${e.message}`);
      console.error(e.stack || String(e));
    }
  }

  // Write destination Doc: Tag (display name) → Account → linked items
  console.log('\n--- Writing destination (tag → account) ---');
  let destBody = null;
  if (!CONFIG.DRY_RUN) {
    const destDoc = DocumentApp.openById(CONFIG.targetDocId);
    destBody = destDoc.getBody();
    destBody.appendParagraph(
      `\n${CONFIG.reportTitle}: ${CONFIG.startDate.toLocaleDateString()} to ${CONFIG.endDate.toLocaleDateString()}`
    ).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  }

  for (const tag of tagKeys) {
    const displayName = CONFIG.tags[tag];
    const accountsWithItems = accountNames.filter(
      account => results[tag][account].length > 0
    );

    if (accountsWithItems.length === 0) {
      console.log(`[Tag] ${tag} ("${displayName}"): no hits — skipping section`);
      continue;
    }

    const itemCount = accountsWithItems.reduce(
      (n, account) => n + results[tag][account].length,
      0
    );
    console.log(
      `[Tag] ${tag} ("${displayName}"): ${itemCount} items across ` +
      `${accountsWithItems.length} account(s)`
    );

    if (CONFIG.DRY_RUN) {
      for (const account of accountsWithItems) {
        console.log(
          `  [DRY RUN] would write ${account}: ${results[tag][account].length} item(s)`
        );
      }
      continue;
    }

    destBody.appendParagraph(displayName).setHeading(DocumentApp.ParagraphHeading.HEADING2);

    for (const account of accountsWithItems) {
      destBody.appendParagraph(account).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      for (const item of results[tag][account]) {
        appendLinkedListItem(destBody, item.fileName, item.fileUrl, item.snippet);
      }
    }
  }

  if (!CONFIG.DRY_RUN && destBody) {
    destBody.appendHorizontalRule();
    console.log('\nAppended horizontal rule to destination Doc');
  }

  console.log('\n=== DONE ===');
  console.log(
    `Accounts ok=${totals.accountsOk} failed=${totals.accountsFailed} withHits=${totals.accountsWithHits}`
  );
  console.log(
    `Files seen=${totals.filesSeen} inRange=${totals.filesInRange} matchingLines=${totals.matchLines}`
  );
  if (CONFIG.DRY_RUN) {
    console.log('Dry-run complete — no changes written. Set CONFIG.DRY_RUN = false to write.');
  } else {
    console.log('Live run complete — summary appended to destination Doc.');
  }
}
