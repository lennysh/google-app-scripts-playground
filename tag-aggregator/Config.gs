/**
 * Tag aggregator — configuration
 * ===================================================================
 * Edit this file for day-to-day behavior.
 *
 * SHARED  — tags, folders, dry-run / clear defaults (stable across periods)
 * PERIODS — named batches (quarters, years, etc.): dates, summary Doc,
 *           and optional per-period document IDs
 * ACTIVE_PERIOD — which PERIODS key runTagAggregator() uses by default
 *
 * Do not commit real Doc / folder IDs if this repo is public.
 */

/**
 * Calendar date in the script timezone (America/New_York). Months are 1–12.
 * Use this for period dates — do not use new Date('YYYY-MM-DD') (that is UTC).
 * Filenames are compared the same way: "2026-07-01 Notes" means July 1 locally.
 */
function localDate(year, month, day) {
  return new Date(year, month - 1, day);
}

/** Settings shared by every period. */
const SHARED = {
  // true = scan sources and log matches only; false = also write into targetDocId
  DRY_RUN: true,

  // true = wipe destination Doc body before writing; false = append to existing content.
  clearDestination: true,

  // Tag → display label used as an H2 in the destination Doc.
  // Keys are the literal substrings matched in source Doc paragraphs.
  tags: {
    '#theme/wins': 'Wins',
    '#theme/risks': 'Risks',
    '#theme/feedback': 'Feedback'
  },

  // Group label → Drive folder ID containing Google Docs to scan.
  // Folder ID is the .../folders/<ID> segment of the Drive URL.
  folders: {
    'Example Account': 'YOUR_FOLDER_ID',
    'Another Account': 'YOUR_FOLDER_ID'
  }
};

/**
 * Named periods (batches). Keys can be anything: '2026-Q1', '2026', 'H1', …
 * Prefer including the year so periods do not collide next year.
 *
 * Per-period fields:
 *   reportTitle   — H1 prefix in the destination Doc
 *   startDate / endDate — inclusive filename-date window for folder scans
 *   targetDocId   — destination summary Doc for this period
 *   documents     — optional extra Doc IDs (always scanned; no date filter).
 *                   Reuse a folders key to merge under that account, or use a
 *                   new label. Values: one Doc ID string or an array of IDs.
 */
const PERIODS = {
  // Example single period — enough for casual use. Add more keys as needed.
  '2026-Q3': {
    reportTitle: 'Q3 2026 Review',
    startDate: localDate(2026, 7, 1),
    endDate: localDate(2026, 9, 30),
    targetDocId: 'YOUR_TARGET_DOC_ID',
    documents: {
      // 'Example Account': 'YOUR_Q3_ACCOUNT_DOC_ID',
      // 'Shared notes': ['YOUR_DOC_ID_1', 'YOUR_DOC_ID_2']
    }
  },

  // --- Optional: more quarters (uncomment / copy as needed) ---
  // '2026-Q1': {
  //   reportTitle: 'Q1 2026 Review',
  //   startDate: localDate(2026, 1, 1),
  //   endDate: localDate(2026, 3, 31),
  //   targetDocId: 'YOUR_Q1_SUMMARY_DOC_ID',
  //   documents: {
  //     'Example Account': 'YOUR_Q1_ACCOUNT_DOC_ID',
  //     'Another Account': 'YOUR_Q1_ACCOUNT_DOC_ID'
  //   }
  // },
  // '2026-Q2': {
  //   reportTitle: 'Q2 2026 Review',
  //   startDate: localDate(2026, 4, 1),
  //   endDate: localDate(2026, 6, 30),
  //   targetDocId: 'YOUR_Q2_SUMMARY_DOC_ID',
  //   documents: {
  //     'Example Account': 'YOUR_Q2_ACCOUNT_DOC_ID',
  //     'Another Account': 'YOUR_Q2_ACCOUNT_DOC_ID'
  //   }
  // },
  // '2026-Q4': {
  //   reportTitle: 'Q4 2026 Review',
  //   startDate: localDate(2026, 10, 1),
  //   endDate: localDate(2026, 12, 31),
  //   targetDocId: 'YOUR_Q4_SUMMARY_DOC_ID',
  //   documents: {
  //     'Example Account': 'YOUR_Q4_ACCOUNT_DOC_ID',
  //     'Another Account': 'YOUR_Q4_ACCOUNT_DOC_ID'
  //   }
  // }
};

/**
 * Which PERIODS key runTagAggregator() uses when called with no argument.
 * Flip this between quarters (or pass a period id to runTagAggregator).
 */
const ACTIVE_PERIOD = '2026-Q3';

/**
 * Merge SHARED + PERIODS[periodId] into a runtime CONFIG object.
 * @param {string=} periodId — defaults to ACTIVE_PERIOD
 * @return {Object} config used by the engine
 */
function buildConfig(periodId) {
  const id = periodId || ACTIVE_PERIOD;
  const period = PERIODS[id];
  if (!period) {
    const known = Object.keys(PERIODS).join(', ') || '(none)';
    throw new Error(
      `Unknown period "${id}". Set ACTIVE_PERIOD or pass a key from PERIODS. ` +
      `Known: ${known}`
    );
  }
  return Object.assign({}, SHARED, period, { periodId: id });
}

/** Log configured period ids (handy sanity check in the Apps Script editor). */
function listPeriods() {
  const ids = Object.keys(PERIODS);
  console.log(`ACTIVE_PERIOD=${ACTIVE_PERIOD}`);
  console.log(`PERIODS (${ids.length}): ${ids.join(', ') || '(none)'}`);
  for (const id of ids) {
    const p = PERIODS[id];
    const docLabels = Object.keys(p.documents || {});
    console.log(
      `  ${id}: ${p.startDate.toLocaleDateString()} → ${p.endDate.toLocaleDateString()} ` +
      `title="${p.reportTitle}" docs=[${docLabels.join(', ') || 'none'}]`
    );
  }
}
