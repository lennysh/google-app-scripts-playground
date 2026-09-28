function rescheduleSharedEvent() {
  // --- CONFIGURATION (tweak these when importing) ---
  const DRY_RUN = true; // true = log only; false = apply setTime
  const EVENT_TITLE = "Weekly Team Sync"; // Title (or distinctive substring) of the event to reschedule
  // Find calendar IDs: Calendar settings → Integrate calendar → Calendar ID
  const CALENDAR_ID = "YOUR_SHARED_CALENDAR_ID@group.calendar.google.com";

  // Target day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const TARGET_WEEKDAY = 2;

  // FreeBusy / event-search window on that day (script timezone from appsscript.json)
  const WINDOW_START_HOUR = 12;
  const WINDOW_START_MINUTE = 0;
  const WINDOW_END_HOUR = 17;
  const WINDOW_END_MINUTE = 0;

  // Candidate start bounds (walked latest → earliest; prefers later slots on ties)
  const EARLIEST_START_HOUR = 12;
  const EARLIEST_START_MINUTE = 0;
  const LATEST_START_HOUR = 16;
  const LATEST_START_MINUTE = 0;

  // Minutes between candidate starts (15 → 4:00, 3:45, …; 5 → 4:00, 3:55, …)
  const SLOT_STEP_MINUTES = 15;

  // --- END CONFIGURATION ---

  if (SLOT_STEP_MINUTES <= 0) {
    Logger.log("SLOT_STEP_MINUTES must be greater than 0.");
    return;
  }

  // Calculate upcoming target weekday
  const today = new Date();
  const targetDay = new Date(today);
  targetDay.setDate(today.getDate() + ((TARGET_WEEKDAY + 7 - today.getDay()) % 7));

  const windowStart = new Date(targetDay);
  windowStart.setHours(WINDOW_START_HOUR, WINDOW_START_MINUTE, 0, 0);

  const windowEnd = new Date(targetDay);
  windowEnd.setHours(WINDOW_END_HOUR, WINDOW_END_MINUTE, 0, 0);

  if (windowEnd <= windowStart) {
    Logger.log("Window end must be after window start.");
    return;
  }

  // 1. Access shared calendar
  const sharedCalendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!sharedCalendar) {
    Logger.log("Error: Could not access calendar with ID: " + CALENDAR_ID);
    return;
  }

  // 2. Fetch target event (USES windowStart and windowEnd to define search boundary)
  const events = sharedCalendar.getEvents(windowStart, windowEnd, { search: EVENT_TITLE });
  if (events.length === 0) {
    Logger.log(`Event "${EVENT_TITLE}" not found on target shared calendar within window.`);
    return;
  }

  const event = events[0];
  const meetingDurationMs = event.getEndTime().getTime() - event.getStartTime().getTime();
  if (meetingDurationMs <= 0) {
    Logger.log("Event has invalid duration (end is not after start).");
    return;
  }

  // 3. Dynamically extract attendee emails directly from event guests
  const ATTENDEE_EMAILS = event.getGuestList(true)
    .map(guest => guest.getEmail())
    .filter(email => email !== "");

  if (ATTENDEE_EMAILS.length === 0) {
    Logger.log("No attendees found on the event to check availability for.");
    return;
  }

  Logger.log(`[Mode: ${DRY_RUN ? "TEST/DRY RUN" : "LIVE"}] Checking availability for ${ATTENDEE_EMAILS.length} attendee(s): ${ATTENDEE_EMAILS.join(", ")} (duration ${meetingDurationMs / 60000} min, step ${SLOT_STEP_MINUTES} min)`);

  // 4. Query availability (USES windowStart and windowEnd to define API query timeframe)
  const request = {
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    items: ATTENDEE_EMAILS.map(email => ({ id: email }))
  };
  const busyData = Calendar.Freebusy.query(request).calendars;

  const slotStepMs = SLOT_STEP_MINUTES * 60 * 1000;

  const latestStart = new Date(targetDay);
  latestStart.setHours(LATEST_START_HOUR, LATEST_START_MINUTE, 0, 0);

  const earliestStart = new Date(targetDay);
  earliestStart.setHours(EARLIEST_START_HOUR, EARLIEST_START_MINUTE, 0, 0);

  if (latestStart < earliestStart) {
    Logger.log("LATEST_START must be on or after EARLIEST_START.");
    return;
  }

  let selectedStart = null;
  let minConflicts = ATTENDEE_EMAILS.length + 1;

  // 5. Evaluate candidate slots for lowest conflict count
  for (let t = latestStart.getTime(); t >= earliestStart.getTime(); t -= slotStepMs) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + meetingDurationMs);
    if (slotEnd > windowEnd) {
      continue;
    }

    const busyCount = ATTENDEE_EMAILS.filter(email => {
      const busyIntervals = busyData[email]?.busy || [];
      return busyIntervals.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return slotStart < bEnd && slotEnd > bStart;
      });
    }).length;

    if (busyCount < minConflicts) {
      minConflicts = busyCount;
      selectedStart = slotStart;
    }

    if (minConflicts === 0) {
      break;
    }
  }

  // 6. Reschedule or log dry run results
  if (selectedStart) {
    const selectedEnd = new Date(selectedStart.getTime() + meetingDurationMs);
    const currentStart = event.getStartTime();

    if (currentStart.getTime() !== selectedStart.getTime()) {
      if (DRY_RUN) {
        Logger.log(`[DRY RUN] WOULD RESCHEDULE: Currently at ${currentStart}. Optimal slot is ${selectedStart} with ${minConflicts} conflict(s). No changes saved.`);
      } else {
        event.setTime(selectedStart, selectedEnd);
        Logger.log(`[LIVE] Rescheduled "${EVENT_TITLE}" to ${selectedStart} with ${minConflicts} conflict(s).`);
      }
    } else {
      Logger.log(`"${EVENT_TITLE}" is already scheduled at the optimal slot: ${selectedStart}`);
    }
  } else {
    Logger.log("No candidate slot fit inside the window for this event duration.");
  }
}
