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
  SYNC_TAG: "[SyncedID:"
};

function syncSharedEvents() {
  const primaryCal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const startDate = new Date(now.getTime() - (CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const endDate = new Date(now.getTime() + (CONFIG.LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000));

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN MODE ENABLED - NO CALENDAR CHANGES WILL BE MADE ===");
  }

  // 1. Map existing synced events on primary calendar
  const primaryEvents = primaryCal.getEvents(startDate, endDate);
  const primarySyncedMap = new Map();

  primaryEvents.forEach(event => {
    const desc = event.getDescription() || "";
    if (desc.includes(CONFIG.SYNC_TAG)) {
      const sourceId = desc.split(CONFIG.SYNC_TAG)[1].split("]")[0].trim();
      primarySyncedMap.set(sourceId, event);
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

      // Check keyword match
      if (target.keywords.length > 0) {
        const matches = target.keywords.some(kw =>
          title.toLowerCase().includes(kw.toLowerCase())
        );
        if (!matches) return;
      }

      const startTime = sourceEvent.getStartTime();
      const endTime = sourceEvent.getEndTime();

      // Combine base ID + start time timestamp so every recurring instance is uniquely tracked
      const uniqueSourceId = `${sourceEvent.getId()}_${startTime.getTime()}`;
      activeSourceIds.add(uniqueSourceId);

      const isAllDay = sourceEvent.isAllDayEvent();
      const location = sourceEvent.getLocation() || "";
      const description = sourceEvent.getDescription() || "";

      if (primarySyncedMap.has(uniqueSourceId)) {
        // UPDATE existing event
        const existingEvent = primarySyncedMap.get(uniqueSourceId);
        const needsUpdate =
          existingEvent.getTitle() !== title ||
          existingEvent.getStartTime().getTime() !== startTime.getTime() ||
          existingEvent.getEndTime().getTime() !== endTime.getTime() ||
          existingEvent.getLocation() !== location;

        if (needsUpdate) {
          if (CONFIG.DRY_RUN) {
            console.log(`[DRY RUN] Would UPDATE: "${title}" at ${startTime}`);
          } else {
            existingEvent.setTitle(title);
            existingEvent.setLocation(location);
            if (isAllDay) {
              existingEvent.setAllDayDates(startTime, endTime);
            } else {
              existingEvent.setTime(startTime, endTime);
            }
          }
        }
      } else {
        // CREATE new event on primary calendar
        const taggedDesc = `${description}\n\n${CONFIG.SYNC_TAG} ${uniqueSourceId}]`;
        if (CONFIG.DRY_RUN) {
          console.log(`[DRY RUN] Would CREATE: "${title}" at ${startTime}`);
        } else {
          if (isAllDay) {
            primaryCal.createAllDayEvent(title, startTime, {
              description: taggedDesc,
              location: location
            });
          } else {
            primaryCal.createEvent(title, startTime, endTime, {
              description: taggedDesc,
              location: location
            });
          }
        }
      }
    });
  });

  // 3. DELETE events from primary calendar that were canceled or removed from source
  primarySyncedMap.forEach((primaryEvent, uniqueSourceId) => {
    if (!activeSourceIds.has(uniqueSourceId)) {
      if (CONFIG.DRY_RUN) {
        console.log(`[DRY RUN] Would DELETE: "${primaryEvent.getTitle()}" at ${primaryEvent.getStartTime()}`);
      } else {
        primaryEvent.deleteEvent();
      }
    }
  });

  if (CONFIG.DRY_RUN) {
    console.log("=== DRY RUN COMPLETE ===");
  }
}
