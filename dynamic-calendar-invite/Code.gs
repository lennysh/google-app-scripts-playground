function rescheduleSharedEvent() {
  // --- CONFIGURATION ---
  const DRY_RUN = true; // Set to 'true' for testing (no event changes saved); 'false' to apply changes live.
  const EVENT_TITLE = "Weekly Team Sync"; // Title (or distinctive substring) of the event to reschedule
  // Find calendar IDs: Calendar settings → Integrate calendar → Calendar ID
  const CALENDAR_ID = "YOUR_SHARED_CALENDAR_ID@group.calendar.google.com";

  // Calculate upcoming Tuesday
  const today = new Date();
  const tuesday = new Date(today);
  tuesday.setDate(today.getDate() + ((2 + 7 - today.getDay()) % 7));

  // Define search & query window (12:00 PM to 5:00 PM ET covers 9:00 AM to 5:00 PM across all 4 US time zones)
  const windowStart = new Date(tuesday);
  windowStart.setHours(12, 0, 0, 0);

  const windowEnd = new Date(tuesday);
  windowEnd.setHours(17, 0, 0, 0);

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

  // 3. Dynamically extract attendee emails directly from event guests
  const ATTENDEE_EMAILS = event.getGuestList(true)
    .map(guest => guest.getEmail())
    .filter(email => email !== "");

  if (ATTENDEE_EMAILS.length === 0) {
    Logger.log("No attendees found on the event to check availability for.");
    return;
  }

  Logger.log(`[Mode: ${DRY_RUN ? "TEST/DRY RUN" : "LIVE"}] Checking availability for ${ATTENDEE_EMAILS.length} attendee(s): ${ATTENDEE_EMAILS.join(", ")}`);

  // 4. Query availability (USES windowStart and windowEnd to define API query timeframe)
  const request = {
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    items: ATTENDEE_EMAILS.map(email => ({ id: email }))
  };
  const busyData = Calendar.Freebusy.query(request).calendars;

  // Candidate hours in Eastern Time priority order (4 PM ET first, then 3 PM, 2 PM, 1 PM, 12 PM)
  const candidateHours = [16, 15, 14, 13, 12];

  let selectedStart = null;
  let minConflicts = ATTENDEE_EMAILS.length + 1;

  // 5. Evaluate candidate slots for lowest conflict count
  for (const hour of candidateHours) {
    const slotStart = new Date(tuesday);
    slotStart.setHours(hour, 0, 0, 0);

    const slotEnd = new Date(tuesday);
    slotEnd.setHours(hour + 1, 0, 0, 0);

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
    const selectedEnd = new Date(selectedStart.getTime() + 60 * 60 * 1000);
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
  }
}
