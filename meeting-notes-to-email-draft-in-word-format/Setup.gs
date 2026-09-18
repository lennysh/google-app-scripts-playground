/**
 * One-time setup helpers. Run from the Apps Script editor.
 */

function setupTrigger() {
  removeTriggers_();
  ScriptApp.newTrigger('processNewMeetingNotes').timeBased().everyMinutes(15).create();
  console.log('Installed trigger: processNewMeetingNotes every 15 minutes.');
}

function removeTrigger() {
  removeTriggers_();
  console.log('Removed all triggers for this project.');
}

function removeTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
}

/**
 * Force authorization (Drive + Gmail compose/send + Calendar + ScriptApp).
 * Does NOT read the inbox — only scopes needed to create drafts / send mail.
 */
function authorizeOnce() {
  DriveApp.getRootFolder();
  ScriptApp.getProjectTriggers();
  Calendar.Events.list(CONFIG.calendarId, { maxResults: 1, singleEvents: true });
  GmailApp.getDrafts();
  Gmail.Users.Drafts.list('me', { maxResults: 1 });

  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  console.log('Authorization OK for ' + Session.getActiveUser().getEmail());
}

function clearProcessedIds() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.processedPropertyKey);
  console.log('Cleared processed meeting note IDs.');
}

function listMeetFolders() {
  for (const name of CONFIG.meetFolderNames) {
    const folders = DriveApp.getFoldersByName(name);
    let count = 0;
    while (folders.hasNext()) {
      const folder = folders.next();
      count++;
      console.log(name + ' → ' + folder.getId() + ' @ ' + folder.getUrl());
    }
    if (count === 0) console.log(name + ' → (not found at Drive root)');
  }
}

/** Print configured customer profiles (safe — emails only, no secrets). */
function listCustomers() {
  for (const c of CONFIG.customers) {
    console.log(
      JSON.stringify({
        id: c.id,
        name: c.name,
        watchAttendees: c.watchAttendees || [],
        watchDomains: c.watchDomains || [],
        to: c.to,
        cc: c.cc || [],
      })
    );
  }
}

/**
 * Show recent Calendar events that match any customer watch list (debug).
 */
function dryRunListMatchingEvents() {
  const now = Date.now();
  const windowStart = new Date(now - CONFIG.lookbackHours * 60 * 60 * 1000);
  const readyBefore = new Date(now - CONFIG.minAgeMinutes * 60 * 1000);
  const events = listEndedEvents_(windowStart, readyBefore);
  let matches = 0;
  for (const event of events) {
    const customer = matchCustomerForEvent_(event);
    if (!customer) continue;
    matches++;
    console.log(
      JSON.stringify({
        title: event.summary,
        end: event.end && (event.end.dateTime || event.end.date),
        customer: customer.id,
        to: customer.to,
        guests: (event.attendees || []).map(function (a) {
          return a.email;
        }),
        attachmentCount: (event.attachments || []).length,
      })
    );
  }
  console.log('Matching events: ' + matches + ' / ' + events.length);
}
