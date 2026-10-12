// ==========================================
// Tag aggregator — engine (see Config.gs)
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

/** Normalize documents config values to an array of Doc ID strings. */
function normalizeDocIds(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.filter(id => id != null && String(id).trim() !== '').map(String);
  }
  return [String(value)];
}

/**
 * Open a Google Doc by ID/file and record matching tag lines under groupLabel.
 * Returns { hitsInFile, matchLines } counts for this file.
 */
function collectTagsFromFile(file, groupLabel, tagKeys, results, perTagCounts) {
  const fileName = file.getName();
  const fileUrl = file.getUrl();
  const doc = DocumentApp.openById(file.getId());
  const paragraphs = doc.getBody().getParagraphs();
  let hitsInFile = 0;
  let matchLines = 0;

  for (let p of paragraphs) {
    const text = p.getText();

    for (let tag of tagKeys) {
      if (text.includes(tag)) {
        const snippet = stripTagsFromText(text, tagKeys);
        results[tag][groupLabel].push({
          fileName: fileName,
          fileUrl: fileUrl,
          snippet: snippet
        });
        hitsInFile++;
        matchLines++;
        if (perTagCounts) perTagCounts[tag]++;
        console.log(`  HIT   tag=${tag}  file="${fileName}"`);
        console.log(
          `        ${snippet.length > 200 ? snippet.slice(0, 200) + '…' : snippet || '(empty after stripping tags)'}`
        );
      }
    }
  }

  return { hitsInFile: hitsInFile, matchLines: matchLines, fileName: fileName };
}

/**
 * Scan account Drive folders (date-filtered) and optional explicit Doc IDs
 * for configured tags. Dry-run logs matches; live mode writes a summary to
 * targetDocId grouped by tag, then group label.
 *
 * Folder Docs: filename must start with YYYY-MM-DD or YYYY.MM.DD in range.
 * Explicit documents: always scanned (no date filter).
 *
 * @param {string=} periodId — PERIODS key; defaults to ACTIVE_PERIOD from Config.gs
 */
function runTagAggregator(periodId) {
  const CONFIG = buildConfig(periodId);
  const mode = CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE';
  const folderLabels = Object.keys(CONFIG.folders || {});
  const documentEntries = CONFIG.documents || {};
  const documentLabels = Object.keys(documentEntries);
  const groupLabels = Array.from(new Set(folderLabels.concat(documentLabels)));
  const tagKeys = Object.keys(CONFIG.tags || {});

  console.log(`=== tag-aggregator [${mode}] period=${CONFIG.periodId} ===`);
  console.log(
    `Date range: ${formatLocalYmd(CONFIG.startDate)} → ` +
    `${formatLocalYmd(CONFIG.endDate)} (folders only; explicit documents always scanned)`
  );
  console.log(
    `Tags: ${tagKeys.map(t => `${t} → "${CONFIG.tags[t]}"`).join(', ') || '(none)'}`
  );
  console.log(`Folders (${folderLabels.length}): ${folderLabels.join(', ') || '(none)'}`);
  console.log(
    `Documents (${documentLabels.length}): ${documentLabels.join(', ') || '(none)'}`
  );
  if (CONFIG.DRY_RUN) {
    console.log('Dry-run: destination Doc will NOT be modified.');
    if (CONFIG.clearDestination) {
      console.log('Dry-run note: clearDestination is on — a live run would wipe the Doc first.');
    }
  } else {
    const writeMode = CONFIG.clearDestination ? 'clear then write' : 'append';
    console.log(`Live: ${writeMode} summary into Doc ${CONFIG.targetDocId}`);
  }
  console.log('---');

  // results[tag][groupLabel] = [{ fileName, fileUrl, snippet }, ...]
  const results = {};
  tagKeys.forEach(tag => {
    results[tag] = {};
    groupLabels.forEach(label => {
      results[tag][label] = [];
    });
  });

  const groupsWithHits = new Set();
  let totals = {
    accountsOk: 0,
    accountsFailed: 0,
    filesSeen: 0,
    filesInRange: 0,
    matchLines: 0,
    explicitDocsOk: 0,
    explicitDocsFailed: 0,
    explicitDocsSeen: 0
  };

  // --- Folders (date-filtered) ---
  for (const [accountName, folderId] of Object.entries(CONFIG.folders || {})) {
    console.log(`\n[Folder] ${accountName}  folderId=${folderId}`);

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

        const collected = collectTagsFromFile(
          file, accountName, tagKeys, results, perTagCounts
        );
        matchLinesThisAccount += collected.matchLines;
        totals.matchLines += collected.matchLines;

        if (collected.hitsInFile > 0) {
          filesWithHits++;
          console.log(
            `  ok    "${fileName}"  fileDate=${formatLocalYmd(fileDate)}  hits=${collected.hitsInFile}`
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
        groupsWithHits.add(accountName);
      } else {
        console.log(`  no matching tagged lines for this folder`);
      }

      totals.accountsOk++;
    } catch (e) {
      totals.accountsFailed++;
      console.error(`  ERROR processing folder ${accountName}: ${e.message}`);
      console.error(e.stack || String(e));
    }
  }

  // --- Explicit documents (always scanned) ---
  for (const [groupLabel, rawIds] of Object.entries(documentEntries)) {
    const docIds = normalizeDocIds(rawIds);
    console.log(`\n[Documents] ${groupLabel}  (${docIds.length} id(s))`);

    if (docIds.length === 0) {
      console.log('  skip  (no Doc IDs configured for this label)');
      continue;
    }

    // Ensure result buckets exist if label was only in documents
    tagKeys.forEach(tag => {
      if (!results[tag][groupLabel]) results[tag][groupLabel] = [];
    });

    let matchLinesThisLabel = 0;
    const perTagCounts = {};
    tagKeys.forEach(tag => (perTagCounts[tag] = 0));

    for (const docId of docIds) {
      console.log(`  docId=${docId}`);
      try {
        const file = DriveApp.getFileById(docId);
        totals.explicitDocsSeen++;
        totals.filesSeen++;
        totals.filesInRange++;

        const collected = collectTagsFromFile(
          file, groupLabel, tagKeys, results, perTagCounts
        );
        matchLinesThisLabel += collected.matchLines;
        totals.matchLines += collected.matchLines;

        if (collected.hitsInFile > 0) {
          console.log(`  ok    "${collected.fileName}"  hits=${collected.hitsInFile}`);
        } else {
          console.log(`  none  "${collected.fileName}"  (no tags)`);
        }

        totals.explicitDocsOk++;
      } catch (e) {
        totals.explicitDocsFailed++;
        console.error(`  ERROR processing Doc ${docId}: ${e.message}`);
        console.error(e.stack || String(e));
      }
    }

    const tagCountStr = tagKeys
      .map(tag => `${tag}=${perTagCounts[tag]}`)
      .join(', ');
    console.log(`  summary: matchLines=${matchLinesThisLabel} | ${tagCountStr}`);

    if (matchLinesThisLabel > 0) {
      groupsWithHits.add(groupLabel);
    }
  }

  // Write destination Doc: Tag (display name) → Group label → linked items
  console.log('\n--- Writing destination (tag → group) ---');
  let destBody = null;
  if (!CONFIG.DRY_RUN) {
    const destDoc = DocumentApp.openById(CONFIG.targetDocId);
    destBody = destDoc.getBody();
    if (CONFIG.clearDestination) {
      destBody.clear();
      console.log('Cleared destination Doc body');
    }
    const headingPrefix = CONFIG.clearDestination ? '' : '\n';
    destBody.appendParagraph(
      `${headingPrefix}${CONFIG.reportTitle}: ${CONFIG.startDate.toLocaleDateString()} to ${CONFIG.endDate.toLocaleDateString()}`
    ).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  }

  // Preserve folders order, then any document-only labels
  const writeLabels = groupLabels;

  for (const tag of tagKeys) {
    const displayName = CONFIG.tags[tag];
    const labelsWithItems = writeLabels.filter(
      label => results[tag][label] && results[tag][label].length > 0
    );

    if (labelsWithItems.length === 0) {
      console.log(`[Tag] ${tag} ("${displayName}"): no hits — skipping section`);
      continue;
    }

    const itemCount = labelsWithItems.reduce(
      (n, label) => n + results[tag][label].length,
      0
    );
    console.log(
      `[Tag] ${tag} ("${displayName}"): ${itemCount} items across ` +
      `${labelsWithItems.length} group(s)`
    );

    if (CONFIG.DRY_RUN) {
      for (const label of labelsWithItems) {
        console.log(
          `  [DRY RUN] would write ${label}: ${results[tag][label].length} item(s)`
        );
      }
      continue;
    }

    destBody.appendParagraph(displayName).setHeading(DocumentApp.ParagraphHeading.HEADING2);

    for (const label of labelsWithItems) {
      destBody.appendParagraph(label).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      for (const item of results[tag][label]) {
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
    `Folders ok=${totals.accountsOk} failed=${totals.accountsFailed} | ` +
    `Explicit docs ok=${totals.explicitDocsOk} failed=${totals.explicitDocsFailed} | ` +
    `groupsWithHits=${groupsWithHits.size}`
  );
  console.log(
    `Files seen=${totals.filesSeen} scanned=${totals.filesInRange} ` +
    `(folders in-range + explicit) matchingLines=${totals.matchLines}`
  );
  if (CONFIG.DRY_RUN) {
    console.log('Dry-run complete — no changes written. Set SHARED.DRY_RUN = false to write.');
  } else if (CONFIG.clearDestination) {
    console.log('Live run complete — destination Doc cleared and rewritten.');
  } else {
    console.log('Live run complete — summary appended to destination Doc.');
  }
}
