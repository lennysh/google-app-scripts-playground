/**
 * One-off cleanup for duplicate primary-calendar copies (e.g. the sync script
 * created many instances of the same invite on one day).
 *
 * Edit CLEANUP_CONFIG, run deleteDuplicateInvitesOnDate with DRY_RUN true,
 * review logs, then set DRY_RUN false.
 */
const CLEANUP_CONFIG = {
  // true = log matches only; false = delete them
  DRY_RUN: true,

  // Calendar day to scan (YYYY-MM-DD), interpreted in the script timezone.
  TARGET_DATE: "2026-10-12",

  // Title to match on that day
  EVENT_TITLE: "Paste the exact invite title here",

  // "exact" = full title match (recommended for deletes); "includes" = substring
  MATCH_MODE: "exact"
};

/**
 * Delete every event on TARGET_DATE whose title matches EVENT_TITLE
 * (primary / default calendar).
 */
function deleteDuplicateInvitesOnDate() {
  const title = String(CLEANUP_CONFIG.EVENT_TITLE || "").trim();
  if (!title || title === "Paste the exact invite title here") {
    console.log("Set CLEANUP_CONFIG.EVENT_TITLE to the invite title before running.");
    return;
  }

  const range = cleanupDayRange_(CLEANUP_CONFIG.TARGET_DATE);
  if (!range) {
    console.log(
      `Invalid TARGET_DATE "${CLEANUP_CONFIG.TARGET_DATE}". Use YYYY-MM-DD (e.g. "2026-10-12").`
    );
    return;
  }

  if (CLEANUP_CONFIG.DRY_RUN) {
    console.log("=== DRY RUN MODE ENABLED - NO EVENTS WILL BE DELETED ===");
  }

  console.log(
    `Scanning primary calendar for title ${CLEANUP_CONFIG.MATCH_MODE} ` +
      `"${title}" on ${CLEANUP_CONFIG.TARGET_DATE} ` +
      `(${range.start.toISOString()} → ${range.end.toISOString()})`
  );

  const primaryCal = CalendarApp.getDefaultCalendar();
  const events = primaryCal.getEvents(range.start, range.end);

  let matched = 0;
  let deleted = 0;
  let failed = 0;

  events.forEach(event => {
    if (!cleanupTitleMatches_(event.getTitle() || "", title)) {
      return;
    }

    matched += 1;
    const when = event.getStartTime().toISOString();
    const id = event.getId();

    if (CLEANUP_CONFIG.DRY_RUN) {
      console.log(
        `[DRY RUN] Would delete #${matched}: "${event.getTitle()}" @ ${when} (id=${id})`
      );
      deleted += 1;
      return;
    }

    try {
      event.deleteEvent();
      console.log(`[LIVE] Deleted #${matched}: "${event.getTitle()}" @ ${when} (id=${id})`);
      deleted += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[LIVE] FAILED #${matched}: "${event.getTitle()}" @ ${when} (id=${id}): ${err}`
      );
    }
  });

  console.log(
    `Done. matched=${matched}, ${CLEANUP_CONFIG.DRY_RUN ? "wouldDelete" : "deleted"}=${deleted}` +
      (failed ? `, failed=${failed}` : "")
  );

  if (CLEANUP_CONFIG.DRY_RUN) {
    console.log("=== DRY RUN COMPLETE — set CLEANUP_CONFIG.DRY_RUN to false to delete ===");
  }
}

function cleanupTitleMatches_(eventTitle, needle) {
  const haystack = eventTitle.toLowerCase();
  const want = needle.toLowerCase();

  if (CLEANUP_CONFIG.MATCH_MODE === "includes") {
    return haystack.includes(want);
  }
  return haystack === want;
}

/** Local midnight → next local midnight for YYYY-MM-DD. */
function cleanupDayRange_(yyyyMmDd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || "").trim());
  if (!m) {
    return null;
  }

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day + 1, 0, 0, 0, 0);

  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month ||
    start.getDate() !== day
  ) {
    return null;
  }

  return { start, end };
}
