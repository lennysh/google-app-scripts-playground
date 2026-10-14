const CONFIG = {
  // Set to true to test and preview changes in logs without modifying your calendar.
  // Set to false when ready to execute actual changes.
  DRY_RUN: true,

  // Add shared calendar IDs and keywords to match.
  // Leave keywords empty [] to sync ALL events from that calendar.
  // Find calendar IDs: Calendar settings → Integrate calendar → Calendar ID
  TARGETS: [
    {
      // Example: weekly team meeting on a shared calendar
      calendarId: "YOUR_SHARED_CALENDAR_ID@group.calendar.google.com",
      keywords: ["Weekly Team Sync"]
    },
    {
      // Example: resource / room calendar (optional)
      calendarId: "YOUR_RESOURCE_CALENDAR_ID@resource.calendar.google.com",
      keywords: ["All-Hands", "Office Hours"]
    }
    // {
    //   // Example: sync every event from a calendar (no keyword filter)
    //   calendarId: "ANOTHER_SHARED_CALENDAR_ID@group.calendar.google.com",
    //   keywords: []
    // }
  ],
  LOOKAHEAD_DAYS: 30, // Days into the future to sync
  LOOKBACK_DAYS: 0,   // Days in the past to maintain
  // Marker embedded in primary event descriptions. Do not change once events exist.
  SYNC_TAG_PREFIX: "[SyncedID:",
  SYNC_TAG_SUFFIX: "]",
  // Meet join details are copied into the description (CalendarApp cannot attach Meet).
  MEET_BLOCK_START: "[MeetSync]",
  MEET_BLOCK_END: "[/MeetSync]"
};

function syncSharedEvents() {
  // Overlapping trigger/manual runs were a common way to spam CREATE.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1 * 60 * 1000)) {
    console.warn("Another syncSharedEvents run holds the lock; skipping this run.");
    return;
  }

  try {
    syncSharedEventsLocked_();
  } finally {
    lock.releaseLock();
  }
}

function syncSharedEventsLocked_() {
  const primaryCal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const startDate = new Date(now.getTime() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + CONFIG.LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN MODE ENABLED - NO CALENDAR CHANGES WILL BE MADE ===");
  }

  // 1. Index existing primary events (by sync id + by title/start/end fingerprint)
  const primaryEvents = primaryCal.getEvents(startDate, endDate);
  const bySyncId = new Map(); // syncId → CalendarEvent (canonical)
  const byFingerprint = new Map(); // fingerprint → CalendarEvent
  const duplicatePrimaries = []; // extras to delete (same sync id or same slot)

  primaryEvents.forEach(event => {
    const syncId = extractSyncId_(event.getDescription() || "");
    const fp = eventFingerprint_(event.getTitle(), event.getStartTime(), event.getEndTime());

    if (syncId) {
      if (bySyncId.has(syncId)) {
        duplicatePrimaries.push(event);
        console.log(
          `Found duplicate primary copy with same SyncedID (${syncId}): "${event.getTitle()}" @ ${event.getStartTime()}`
        );
        return;
      }
      bySyncId.set(syncId, event);
    }

    if (byFingerprint.has(fp)) {
      // Same title+time already indexed — prefer a tagged copy; drop the other.
      const existing = byFingerprint.get(fp);
      const existingSync = extractSyncId_(existing.getDescription() || "");
      if (syncId && !existingSync) {
        duplicatePrimaries.push(existing);
        byFingerprint.set(fp, event);
      } else {
        duplicatePrimaries.push(event);
        if (syncId) {
          bySyncId.delete(syncId);
        }
      }
      return;
    }

    byFingerprint.set(fp, event);
  });

  // Remove obvious primary duplicates before create/update so they cannot linger.
  duplicatePrimaries.forEach(event => {
    if (CONFIG.DRY_RUN) {
      console.log(
        `[DRY RUN] Would DELETE duplicate: "${event.getTitle()}" @ ${event.getStartTime()}`
      );
    } else {
      event.deleteEvent();
      console.log(`[LIVE] Deleted duplicate: "${event.getTitle()}" @ ${event.getStartTime()}`);
    }
  });

  const activeSourceIds = new Set();

  // 2. Fetch and sync source calendar events
  CONFIG.TARGETS.forEach(target => {
    const sourceCal = CalendarApp.getCalendarById(target.calendarId);
    if (!sourceCal) {
      console.warn(`Calendar not found: ${target.calendarId}`);
      return;
    }

    const sourceEvents = sourceCal.getEvents(startDate, endDate);

    sourceEvents.forEach(sourceEvent => {
      const title = sourceEvent.getTitle();

      if (target.keywords.length > 0) {
        const matches = target.keywords.some(kw =>
          title.toLowerCase().includes(kw.toLowerCase())
        );
        if (!matches) return;
      }

      const startTime = sourceEvent.getStartTime();
      const endTime = sourceEvent.getEndTime();
      const uniqueSourceId = `${sourceEvent.getId()}_${startTime.getTime()}`;
      activeSourceIds.add(uniqueSourceId);

      const isAllDay = sourceEvent.isAllDayEvent();
      const location = sourceEvent.getLocation() || "";
      const description = sourceEvent.getDescription() || "";
      const meetBlock = buildMeetBlock_(target.calendarId, sourceEvent);
      const fp = eventFingerprint_(title, startTime, endTime);
      const taggedDesc = buildTaggedDescription_(description, uniqueSourceId, meetBlock);

      let existingEvent = bySyncId.get(uniqueSourceId) || null;

      // Fallback: same title+slot already on primary (untagged or stale tag) → reuse, don't CREATE.
      if (!existingEvent && byFingerprint.has(fp)) {
        existingEvent = byFingerprint.get(fp);
        const priorId = extractSyncId_(existingEvent.getDescription() || "");
        if (CONFIG.DRY_RUN) {
          console.log(
            `[DRY RUN] Would ADOPT existing primary event as sync of "${title}" @ ${startTime}` +
              (priorId ? ` (was SyncedID ${priorId})` : " (was untagged)")
          );
        } else {
          existingEvent.setDescription(taggedDesc);
          console.log(`[LIVE] Adopted existing primary event for "${title}" @ ${startTime}`);
        }
        bySyncId.set(uniqueSourceId, existingEvent);
        if (priorId && priorId !== uniqueSourceId) {
          bySyncId.delete(priorId);
        }
      }

      if (existingEvent) {
        const currentDesc = existingEvent.getDescription() || "";
        const needsUpdate =
          existingEvent.getTitle() !== title ||
          existingEvent.getStartTime().getTime() !== startTime.getTime() ||
          existingEvent.getEndTime().getTime() !== endTime.getTime() ||
          existingEvent.getLocation() !== location ||
          currentDesc !== taggedDesc;

        if (needsUpdate) {
          if (CONFIG.DRY_RUN) {
            console.log(
              `[DRY RUN] Would UPDATE: "${title}" at ${startTime}` +
                (meetBlock ? " (incl. Meet link in description)" : "")
            );
          } else {
            existingEvent.setTitle(title);
            existingEvent.setLocation(location);
            existingEvent.setDescription(taggedDesc);
            if (isAllDay) {
              existingEvent.setAllDayDates(startTime, endTime);
            } else {
              existingEvent.setTime(startTime, endTime);
            }
          }
        }

        bySyncId.set(uniqueSourceId, existingEvent);
        byFingerprint.set(fp, existingEvent);
        return;
      }

      // CREATE only when no sync-id match and no title+time match.
      if (CONFIG.DRY_RUN) {
        console.log(
          `[DRY RUN] Would CREATE: "${title}" at ${startTime}` +
            (meetBlock ? " (incl. Meet link in description)" : "")
        );
      } else {
        let created;
        if (isAllDay) {
          created = primaryCal.createAllDayEvent(title, startTime, {
            description: taggedDesc,
            location: location
          });
        } else {
          created = primaryCal.createEvent(title, startTime, endTime, {
            description: taggedDesc,
            location: location
          });
        }
        console.log(
          `[LIVE] Created: "${title}" at ${startTime}` +
            (meetBlock ? " (Meet link in description)" : "")
        );
        bySyncId.set(uniqueSourceId, created);
        byFingerprint.set(fp, created);
      }
    });
  });

  // 3. DELETE primary copies whose source disappeared (only tagged sync events).
  bySyncId.forEach((primaryEvent, uniqueSourceId) => {
    if (activeSourceIds.has(uniqueSourceId)) {
      return;
    }
    if (CONFIG.DRY_RUN) {
      console.log(
        `[DRY RUN] Would DELETE stale sync: "${primaryEvent.getTitle()}" at ${primaryEvent.getStartTime()}`
      );
    } else {
      primaryEvent.deleteEvent();
      console.log(
        `[LIVE] Deleted stale sync: "${primaryEvent.getTitle()}" at ${primaryEvent.getStartTime()}`
      );
    }
  });

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN COMPLETE ===");
  }
}

function extractSyncId_(description) {
  const prefix = escapeRegExp_(CONFIG.SYNC_TAG_PREFIX);
  const suffix = escapeRegExp_(CONFIG.SYNC_TAG_SUFFIX);
  const re = new RegExp(`${prefix}\\s*([^\\]]+?)\\s*${suffix}`);
  const match = String(description || "").match(re);
  return match ? match[1].trim() : "";
}

function buildTaggedDescription_(sourceDescription, uniqueSourceId, meetBlock) {
  let body = String(sourceDescription || "");
  // Drop prior sync / meet markers so rewrites stay idempotent.
  body = body.replace(
    new RegExp(
      `${escapeRegExp_(CONFIG.SYNC_TAG_PREFIX)}\\s*[^\\]]*\\s*${escapeRegExp_(CONFIG.SYNC_TAG_SUFFIX)}`,
      "g"
    ),
    ""
  );
  body = body.replace(
    new RegExp(
      `${escapeRegExp_(CONFIG.MEET_BLOCK_START)}[\\s\\S]*?${escapeRegExp_(CONFIG.MEET_BLOCK_END)}`,
      "g"
    ),
    ""
  );
  body = body.trim();

  const parts = [];
  if (body) {
    parts.push(body);
  }
  if (meetBlock) {
    parts.push(
      `${CONFIG.MEET_BLOCK_START}\n${meetBlock}\n${CONFIG.MEET_BLOCK_END}`
    );
  }
  parts.push(`${CONFIG.SYNC_TAG_PREFIX} ${uniqueSourceId}${CONFIG.SYNC_TAG_SUFFIX}`);
  return parts.join("\n\n");
}

/**
 * Pull Google Meet / conference join info via Advanced Calendar service and
 * format it for the primary event description. Returns "" when absent.
 * Requires Advanced Calendar API (see appsscript.js enabledAdvancedServices).
 */
function buildMeetBlock_(calendarId, sourceEvent) {
  const apiEvent = fetchSourceApiEvent_(calendarId, sourceEvent);
  if (!apiEvent) {
    return "";
  }

  const lines = [];
  const entryPoints =
    (apiEvent.conferenceData && apiEvent.conferenceData.entryPoints) || [];

  let videoUri = apiEvent.hangoutLink || "";
  if (!videoUri) {
    const video = entryPoints.find(ep => ep && ep.entryPointType === "video" && ep.uri);
    if (video) {
      videoUri = video.uri;
    }
  }
  if (videoUri) {
    lines.push(`Google Meet: ${videoUri}`);
  }

  entryPoints.forEach(ep => {
    if (!ep || ep.entryPointType !== "phone" || !ep.uri) {
      return;
    }
    let phone = `Phone: ${String(ep.uri).replace(/^tel:/i, "")}`;
    if (ep.pin) {
      phone += ` PIN: ${ep.pin}`;
    }
    lines.push(phone);
  });

  return lines.join("\n");
}

function fetchSourceApiEvent_(calendarId, sourceEvent) {
  if (typeof Calendar === "undefined" || !Calendar.Events) {
    console.warn(
      "Advanced Calendar service (Calendar) is not enabled; Meet links will not be copied. " +
        "Enable it under Services, or apply appsscript.js dependencies.enabledAdvancedServices."
    );
    return null;
  }

  const rawId = String(sourceEvent.getId() || "");
  const eventId = rawId.replace(/@.*$/, "");
  if (!eventId) {
    return null;
  }

  try {
    return Calendar.Events.get(calendarId, eventId);
  } catch (err) {
    // Recurring instances sometimes need a timed list match.
    try {
      const start = sourceEvent.getStartTime();
      const end = sourceEvent.getEndTime();
      const list = Calendar.Events.list(calendarId, {
        timeMin: new Date(start.getTime() - 60 * 1000).toISOString(),
        timeMax: new Date(end.getTime() + 60 * 1000).toISOString(),
        singleEvents: true,
        maxResults: 25
      });
      const items = (list && list.items) || [];
      const title = sourceEvent.getTitle();
      const match = items.find(item => {
        if (!item || item.summary !== title) {
          return false;
        }
        const itemStartRaw = item.start && (item.start.dateTime || item.start.date);
        if (!itemStartRaw) {
          return false;
        }
        return Math.abs(new Date(itemStartRaw).getTime() - start.getTime()) < 2000;
      });
      return match || null;
    } catch (fallbackErr) {
      console.warn(
        `Meet lookup failed for "${sourceEvent.getTitle()}": ${err}; fallback: ${fallbackErr}`
      );
      return null;
    }
  }
}

function eventFingerprint_(title, startTime, endTime) {
  return [
    String(title || "").trim().toLowerCase(),
    startTime.getTime(),
    endTime.getTime()
  ].join("|");
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
