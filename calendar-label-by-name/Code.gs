const CONFIG = {
  // Set to true to preview label changes in logs without modifying events.
  // Set to false when ready to apply labels.
  DRY_RUN: true,

  LOOKAHEAD_DAYS: 30, // Days into the future to scan
  LOOKBACK_DAYS: 0,   // Days in the past to scan

  // Title matching: "includes" = case-insensitive substring; "exact" = full title match
  MATCH_MODE: "includes",

  // First matching rule wins when multiple rules match the same event.
  // `eventName` is matched against the event title.
  // `label` must match an existing Calendar Label name on your primary calendar
  // (run listCalendarLabels() to see names / ids).
  RULES: [
    {
      eventName: "Weekly Team Sync",
      label: "Team Meeting"
    },
    {
      eventName: "1:1",
      label: "Important Project"
    }
  ]
};

/**
 * Scan the default calendar and set configured labels on matching events.
 */
function applyCalendarLabelsByName() {
  if (!CONFIG.RULES || CONFIG.RULES.length === 0) {
    console.log("No RULES configured. Nothing to do.");
    return;
  }

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN MODE ENABLED - NO LABEL CHANGES WILL BE MADE ===");
  }

  const labelByName = loadLabelMap_();
  if (labelByName.size === 0) {
    console.warn(
      "No Calendar Labels found on the primary calendar. " +
        "Create labels in Google Calendar (or via the API), then run listCalendarLabels()."
    );
    return;
  }

  const unresolved = [];
  const rules = CONFIG.RULES.map(rule => {
    const labelId = labelByName.get(normalizeLabelName_(rule.label));
    if (!labelId) {
      unresolved.push(rule.label);
    }
    return { ...rule, labelId };
  });

  if (unresolved.length > 0) {
    console.warn(
      "These configured label names were not found on the calendar: " +
        unresolved.join(", ")
    );
    console.warn("Available labels: " + [...labelByName.keys()].join(", "));
  }

  const activeRules = rules.filter(r => r.labelId);
  if (activeRules.length === 0) {
    console.warn("No rules have resolvable labels. Aborting.");
    return;
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + CONFIG.LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  let updated = 0;
  let skipped = 0;
  let matched = 0;

  forEachPrimaryEvent_(timeMin, timeMax, event => {
    const title = event.summary || "";
    const rule = findMatchingRule_(title, activeRules);
    if (!rule) {
      return;
    }

    matched += 1;
    const currentLabelId = event.eventLabelId || "";

    if (currentLabelId === rule.labelId) {
      skipped += 1;
      console.log(
        `SKIP (already labeled): "${title}" @ ${formatEventWhen_(event)} → "${rule.label}"`
      );
      return;
    }

    if (CONFIG.DRY_RUN) {
      console.log(
        `[DRY RUN] Would set label "${rule.label}" on "${title}" @ ${formatEventWhen_(event)}` +
          (currentLabelId ? ` (was label id ${currentLabelId})` : " (no label)")
      );
      updated += 1;
      return;
    }

    Calendar.Events.patch(
      { eventLabelId: rule.labelId },
      "primary",
      event.id,
      { eventLabelVersion: 1 }
    );
    console.log(
      `[LIVE] Set label "${rule.label}" on "${title}" @ ${formatEventWhen_(event)}`
    );
    updated += 1;
  });

  console.log(
    `Done. matched=${matched}, ${CONFIG.DRY_RUN ? "wouldUpdate" : "updated"}=${updated}, alreadyCorrect=${skipped}`
  );

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN COMPLETE ===");
  }
}

/**
 * Log every Calendar Label defined on the primary calendar (name → id → color).
 * Run this once to discover valid `label` values for CONFIG.RULES.
 */
function listCalendarLabels() {
  const calendar = Calendar.Calendars.get("primary");
  const labels = calendar.labelProperties?.eventLabels || [];

  if (labels.length === 0) {
    console.log("No Calendar Labels defined on the primary calendar.");
    return;
  }

  console.log(`Found ${labels.length} label(s) on primary:`);
  labels.forEach(label => {
    console.log(
      `- name: "${label.name || "(unnamed)"}" | id: ${label.id} | color: ${label.backgroundColor}`
    );
  });
}

function loadLabelMap_() {
  const calendar = Calendar.Calendars.get("primary");
  const labels = calendar.labelProperties?.eventLabels || [];
  const map = new Map();

  labels.forEach(label => {
    if (!label.id) {
      return;
    }
    const key = normalizeLabelName_(label.name || "");
    if (!key) {
      console.warn(`Skipping unlabeled entry with id ${label.id}`);
      return;
    }
    if (map.has(key)) {
      console.warn(`Duplicate label name "${label.name}" — using id ${label.id}`);
    }
    map.set(key, label.id);
  });

  return map;
}

function findMatchingRule_(title, rules) {
  const haystack = title.toLowerCase();

  for (const rule of rules) {
    const needle = (rule.eventName || "").toLowerCase();
    if (!needle) {
      continue;
    }

    if (CONFIG.MATCH_MODE === "exact") {
      if (haystack === needle) {
        return rule;
      }
    } else if (haystack.includes(needle)) {
      return rule;
    }
  }

  return null;
}

function forEachPrimaryEvent_(timeMin, timeMax, callback) {
  let pageToken;

  do {
    const page = Calendar.Events.list("primary", {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      eventLabelVersion: 1,
      pageToken
    });

    (page.items || []).forEach(callback);
    pageToken = page.nextPageToken;
  } while (pageToken);
}

function normalizeLabelName_(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function formatEventWhen_(event) {
  if (event.start?.dateTime) {
    return event.start.dateTime;
  }
  if (event.start?.date) {
    return `all-day ${event.start.date}`;
  }
  return "(unknown time)";
}
