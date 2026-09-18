/**
 * Calendar-attendee router: find meetings with watched customer guests,
 * resolve the Gemini notes Doc, export .docx, email each customer's TO list.
 */

function processNewMeetingNotes() {
  assertCustomersConfigured_();

  const now = Date.now();
  const windowStart = new Date(now - CONFIG.lookbackHours * 60 * 60 * 1000);
  const readyBefore = new Date(now - CONFIG.minAgeMinutes * 60 * 1000);
  const processed = loadProcessedIds_();
  const events = listEndedEvents_(windowStart, readyBefore);

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const event of events) {
    if (sent >= CONFIG.maxEmailsPerRun) {
      console.log('Hit maxEmailsPerRun; remaining events wait for the next run.');
      break;
    }

    const customer = matchCustomerForEvent_(event);
    if (!customer) {
      skipped++;
      continue;
    }

    let file;
    try {
      file = resolveNotesDoc_(event);
    } catch (err) {
      errors.push({ eventId: event.id, title: event.summary, error: String(err.message || err) });
      console.error('Resolve notes failed for "' + event.summary + '": ' + (err.message || err));
      continue;
    }

    if (!file) {
      // Notes not ready yet — retry on a later run (do not mark processed)
      console.log('No notes Doc yet for: ' + event.summary + ' (' + event.id + ')');
      skipped++;
      continue;
    }

    const dedupeKey = event.id + ':' + file.getId();
    if (processed.has(dedupeKey) || processed.has(file.getId())) {
      skipped++;
      continue;
    }

    try {
      deliverNotes_(file, customer, event);
      processed.add(dedupeKey);
      processed.add(file.getId());
      sent++;
      console.log(
        'Delivered "' + (event.summary || file.getName()) + '" [' + customer.id + '] → ' + customer.to.join(', ')
      );
    } catch (err) {
      errors.push({ eventId: event.id, title: event.summary, error: String(err.message || err) });
      console.error('Deliver failed for "' + event.summary + '": ' + (err.message || err));
    }
  }

  saveProcessedIds_(processed);
  return { events: events.length, sent: sent, skipped: skipped, errors: errors };
}

/** Log matches without exporting or emailing. */
function dryRunProcessNewMeetingNotes() {
  assertCustomersConfigured_();

  const now = Date.now();
  const windowStart = new Date(now - CONFIG.lookbackHours * 60 * 60 * 1000);
  const readyBefore = new Date(now - CONFIG.minAgeMinutes * 60 * 1000);
  const processed = loadProcessedIds_();
  const events = listEndedEvents_(windowStart, readyBefore);

  console.log('Dry run — ended events in window: ' + events.length);
  for (const event of events) {
    const customer = matchCustomerForEvent_(event);
    const guests = (event.attendees || []).map(function (a) {
      return a.email;
    });
    let file = null;
    let resolveError = null;
    try {
      file = resolveNotesDoc_(event);
    } catch (err) {
      resolveError = String(err.message || err);
    }

    const dedupeKey = file ? event.id + ':' + file.getId() : null;
    const already = file && (processed.has(dedupeKey) || processed.has(file.getId()));

    console.log(
      JSON.stringify({
        title: event.summary,
        eventId: event.id,
        end: event.end && (event.end.dateTime || event.end.date),
        guests: guests,
        matchedCustomer: customer ? customer.id : null,
        notesDocId: file ? file.getId() : null,
        notesDocName: file ? file.getName() : null,
        resolveError: resolveError,
        action: !customer
          ? 'skip-no-customer'
          : !file
            ? 'wait-for-notes'
            : already
              ? 'skip-processed'
              : 'would-deliver-to:' + customer.to.join(','),
      })
    );
  }
}

function assertCustomersConfigured_() {
  if (!CONFIG.customers || !CONFIG.customers.length) {
    throw new Error('CONFIG.customers is empty — add at least one customer profile in Config.gs');
  }
  for (const c of CONFIG.customers) {
    if (!c.id || !c.to || !c.to.length) {
      throw new Error('Customer profile missing id or to[]: ' + JSON.stringify(c));
    }
    const watches = (c.watchAttendees || []).length + (c.watchDomains || []).length;
    if (!watches) {
      throw new Error('Customer "' + c.id + '" needs watchAttendees and/or watchDomains');
    }
  }
}

/**
 * Events that have ended by readyBefore and started (or ended) within lookback.
 * Uses Advanced Calendar Service for attendees + attachments in one call.
 */
function listEndedEvents_(windowStart, readyBefore) {
  const out = [];
  let pageToken = null;
  // Calendar API: timeMin filters by event END; timeMax filters by event START.
  const timeMax = new Date(); // include anything that has started by now

  do {
    const resp = Calendar.Events.list(CONFIG.calendarId, {
      timeMin: windowStart.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
      pageToken: pageToken,
    });

    const items = resp.items || [];
    for (const event of items) {
      if (event.status === 'cancelled') continue;
      const endMs = eventEndMs_(event);
      // Only events that ended in-window and long enough ago for Gemini to finish
      if (!endMs || endMs < windowStart.getTime()) continue;
      if (endMs > readyBefore.getTime()) continue;
      out.push(event);
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);

  return out;
}

function eventEndMs_(event) {
  const end = event.end || {};
  if (end.dateTime) return new Date(end.dateTime).getTime();
  // All-day: end.date is exclusive next-day; treat as end of previous day locally is fine for filtering
  if (end.date) return new Date(end.date).getTime();
  return 0;
}

function matchCustomerForEvent_(event) {
  const emails = (event.attendees || [])
    .map(function (a) {
      return String(a.email || '')
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);

  // Organizer is not always in attendees[]
  if (event.organizer && event.organizer.email) {
    emails.push(String(event.organizer.email).trim().toLowerCase());
  }

  for (const customer of CONFIG.customers) {
    if (customerMatchesEmails_(customer, emails)) return customer;
  }
  return null;
}

function customerMatchesEmails_(customer, attendeeEmailsLower) {
  const watched = (customer.watchAttendees || []).map(function (e) {
    return String(e).trim().toLowerCase();
  });
  for (const email of attendeeEmailsLower) {
    if (watched.indexOf(email) !== -1) return true;
  }

  const domains = (customer.watchDomains || []).map(function (d) {
    return String(d).trim().toLowerCase().replace(/^@/, '');
  });
  if (!domains.length) return false;

  for (const email of attendeeEmailsLower) {
    const at = email.lastIndexOf('@');
    if (at === -1) continue;
    const domain = email.substring(at + 1);
    if (domains.indexOf(domain) !== -1) return true;
  }
  return false;
}

/**
 * Prefer Calendar event attachments (Gemini usually attaches the notes Doc).
 * Fallback: Doc under Meet folders created near the event end time.
 */
function resolveNotesDoc_(event) {
  const fromAttachment = notesDocFromAttachments_(event);
  if (fromAttachment) return fromAttachment;
  return notesDocFromDriveFallback_(event);
}

function notesDocFromAttachments_(event) {
  const attachments = event.attachments || [];
  for (const att of attachments) {
    const fileId = fileIdFromAttachment_(att);
    if (!fileId) continue;
    try {
      const file = DriveApp.getFileById(fileId);
      if (file.getMimeType() === MimeType.GOOGLE_DOCS) return file;
    } catch (e) {
      console.warn('Attachment not readable: ' + fileId + ' — ' + (e.message || e));
    }
  }
  return null;
}

function fileIdFromAttachment_(att) {
  if (att.fileId) return att.fileId;
  const url = att.fileUrl || '';
  const match = url.match(/\/(?:document\/d\/|d\/|file\/d\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function notesDocFromDriveFallback_(event) {
  const endMs = eventEndMs_(event);
  if (!endMs) return null;

  const windowMs = (CONFIG.driveFallbackWindowMinutes || 180) * 60 * 1000;
  const minCreated = endMs - 30 * 60 * 1000; // allow notes started slightly before hard stop
  const maxCreated = endMs + windowMs;
  const title = String(event.summary || '').toLowerCase();

  const docs = findMeetingNoteDocs_(minCreated, maxCreated);
  if (!docs.length) return null;

  // Prefer title overlap with the Calendar event; otherwise nearest creation after end
  let best = null;
  let bestScore = -1;
  for (const file of docs) {
    const name = file.getName().toLowerCase();
    let score = 0;
    if (title && name.indexOf(title) !== -1) score += 100;
    if (title && title.indexOf(name) !== -1) score += 80;
    // Prefer closer to event end
    const delta = Math.abs(file.getDateCreated().getTime() - endMs);
    score += Math.max(0, 50 - delta / (60 * 1000));
    if (score > bestScore) {
      bestScore = score;
      best = file;
    }
  }
  return best;
}

function deliverNotes_(file, customer, eventOrTitle) {
  const event = eventOrTitle && typeof eventOrTitle === 'object' ? eventOrTitle : null;
  const title = (event && event.summary) || (typeof eventOrTitle === 'string' ? eventOrTitle : null) || file.getName();
  const when = formatMeetingWhen_(event, file);
  const blob = exportGoogleDocAsDocx_(file).setName(sanitizeFilename_(title) + '.docx');
  const subject = applyTemplate_(CONFIG.subjectTemplate, { title: title, when: when });
  const plainBody = applyTemplate_(CONFIG.bodyTemplate, { title: title, when: when });
  const htmlBody = applyTemplate_(CONFIG.htmlBodyTemplate || '', {
    title: escapeHtml_(title),
    when: escapeHtml_(when),
  });

  // GmailApp.createDraft often ignores htmlBody when attachments are present.
  // Build a real multipart MIME message via the Gmail API instead.
  const raw = buildRawMimeEmail_({
    to: customer.to.join(', '),
    cc: (customer.cc || []).join(', '),
    bcc: CONFIG.bcc || '',
    fromName: CONFIG.fromName || '',
    subject: subject,
    plainBody: plainBody,
    htmlBody: htmlBody,
    attachment: blob,
  });

  if (CONFIG.deliveryMode === 'draft') {
    Gmail.Users.Drafts.create({ message: { raw: raw } }, 'me');
  } else {
    Gmail.Users.Messages.send({ raw: raw }, 'me');
  }
}

function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * multipart/mixed = (multipart/alternative: plain+html) + DOCX attachment
 * Returned as base64url for Gmail API drafts.create / messages.send
 */
function buildRawMimeEmail_(opts) {
  const nl = '\r\n';
  const boundaryMixed = 'mixed_' + Utilities.getUuid().replace(/-/g, '');
  const boundaryAlt = 'alt_' + Utilities.getUuid().replace(/-/g, '');
  const html =
    opts.htmlBody ||
    '<pre style="font-family:sans-serif;white-space:pre-wrap;">' + escapeHtml_(opts.plainBody) + '</pre>';

  const lines = [];
  lines.push('MIME-Version: 1.0');
  lines.push('To: ' + opts.to);
  if (opts.cc) lines.push('Cc: ' + opts.cc);
  if (opts.bcc) lines.push('Bcc: ' + opts.bcc);
  if (opts.fromName) {
    lines.push('From: ' + rfc2047Encode_(opts.fromName) + ' <' + Session.getActiveUser().getEmail() + '>');
  }
  lines.push('Subject: ' + rfc2047Encode_(opts.subject));
  lines.push('Content-Type: multipart/mixed; boundary="' + boundaryMixed + '"');
  lines.push('');
  lines.push('--' + boundaryMixed);
  lines.push('Content-Type: multipart/alternative; boundary="' + boundaryAlt + '"');
  lines.push('');
  lines.push('--' + boundaryAlt);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(chunkBase64_(Utilities.base64Encode(opts.plainBody || '', Utilities.Charset.UTF_8)));
  lines.push('--' + boundaryAlt);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(chunkBase64_(Utilities.base64Encode(html, Utilities.Charset.UTF_8)));
  lines.push('--' + boundaryAlt + '--');

  const att = opts.attachment;
  if (att) {
    const filename = (att.getName() || 'notes.docx').replace(/"/g, '');
    const mime = att.getContentType() || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    lines.push('--' + boundaryMixed);
    lines.push('Content-Type: ' + mime + '; name="' + filename + '"');
    lines.push('Content-Disposition: attachment; filename="' + filename + '"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(chunkBase64_(Utilities.base64Encode(att.getBytes())));
  }

  lines.push('--' + boundaryMixed + '--');
  const raw = lines.join(nl);

  // Gmail API wants web-safe base64 without padding
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function rfc2047Encode_(text) {
  const value = String(text || '');
  // Encode if non-ASCII or special header chars
  if (/^[\x20-\x7E]*$/.test(value) && value.indexOf('=?') === -1) return value;
  return '=?UTF-8?B?' + Utilities.base64Encode(value, Utilities.Charset.UTF_8) + '?=';
}

function chunkBase64_(b64) {
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.substring(i, i + 76));
  }
  return chunks.join('\r\n');
}

/**
 * Human-readable meeting window in the script timezone, e.g.
 * "Mon, Aug 10, 2026, 2:00–2:30 PM EDT"
 */
function formatMeetingWhen_(event, file) {
  const tz = Session.getScriptTimeZone();
  const start = eventStartDate_(event);
  const end = eventEndDate_(event);

  if (start && end) {
    const sameDay =
      Utilities.formatDate(start, tz, 'yyyy-MM-dd') === Utilities.formatDate(end, tz, 'yyyy-MM-dd');
    if (sameDay) {
      return (
        Utilities.formatDate(start, tz, 'EEE, MMM d, yyyy, h:mm a') +
        '–' +
        Utilities.formatDate(end, tz, 'h:mm a z')
      );
    }
    return (
      Utilities.formatDate(start, tz, 'EEE, MMM d, yyyy, h:mm a') +
      ' – ' +
      Utilities.formatDate(end, tz, 'EEE, MMM d, yyyy, h:mm a z')
    );
  }

  if (start) {
    return Utilities.formatDate(start, tz, 'EEE, MMM d, yyyy, h:mm a z');
  }

  // Manual sends / no Calendar event: fall back to Doc created time
  return Utilities.formatDate(file.getDateCreated(), tz, 'EEE, MMM d, yyyy, h:mm a z') + ' (notes created)';
}

function eventStartDate_(event) {
  if (!event || !event.start) return null;
  if (event.start.dateTime) return new Date(event.start.dateTime);
  if (event.start.date) return new Date(event.start.date + 'T00:00:00');
  return null;
}

function eventEndDate_(event) {
  if (!event || !event.end) return null;
  if (event.end.dateTime) return new Date(event.end.dateTime);
  if (event.end.date) return new Date(event.end.date + 'T00:00:00');
  return null;
}

/**
 * DriveApp.getAs(MimeType.MICROSOFT_WORD) cannot convert Google Docs → DOCX.
 * Use Drive API v3 files.export instead.
 */
function exportGoogleDocAsDocx_(file) {
  const fileId = resolveDriveFileId_(file);
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const url =
    'https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(fileId) +
    '/export?mimeType=' +
    encodeURIComponent(mime);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Drive export failed (' + code + '): ' + response.getContentText());
  }

  return response.getBlob().setContentType(mime);
}

/** Follow Drive shortcuts so we export the real Google Doc. */
function resolveDriveFileId_(file) {
  const mime = file.getMimeType();
  if (mime !== 'application/vnd.google-apps.shortcut') return file.getId();

  // Shortcut target requires Advanced Drive or Drive.Files.get; parse via DriveApp is limited.
  // Fall back to the shortcut id only if target is unavailable — prefer API get.
  const metaUrl =
    'https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(file.getId()) +
    '?fields=shortcutDetails/targetId,mimeType';
  const meta = UrlFetchApp.fetch(metaUrl, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (meta.getResponseCode() !== 200) {
    throw new Error('Could not resolve shortcut: ' + meta.getContentText());
  }
  const json = JSON.parse(meta.getContentText());
  const targetId = json.shortcutDetails && json.shortcutDetails.targetId;
  if (!targetId) throw new Error('Shortcut has no targetId: ' + file.getId());
  return targetId;
}

function applyTemplate_(template, values) {
  return String(template)
    .replace(/\{\{title\}\}/g, values.title || '')
    .replace(/\{\{when\}\}/g, values.when || '')
    .replace(/\{\{date\}\}/g, values.when || values.date || '');
}

function sanitizeFilename_(name) {
  return String(name || 'meeting-notes')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120);
}

function findMeetingNoteDocs_(minCreatedMs, maxCreatedMs) {
  const results = [];
  const seen = {};

  for (const folderName of CONFIG.meetFolderNames) {
    const folders = DriveApp.getFoldersByName(folderName);
    while (folders.hasNext()) {
      collectDocsInFolder_(folders.next(), minCreatedMs, maxCreatedMs, results, seen, 0);
    }
  }
  return results;
}

function collectDocsInFolder_(folder, minCreatedMs, maxCreatedMs, results, seen, depth) {
  if (depth > 8) return;

  const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (files.hasNext()) {
    const file = files.next();
    const id = file.getId();
    if (seen[id]) continue;
    seen[id] = true;

    const created = file.getDateCreated().getTime();
    if (created < minCreatedMs || created > maxCreatedMs) continue;
    results.push(file);
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    collectDocsInFolder_(subfolders.next(), minCreatedMs, maxCreatedMs, results, seen, depth + 1);
  }
}

function loadProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty(CONFIG.processedPropertyKey) || '[]';
  try {
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

function saveProcessedIds_(processedSet) {
  const ids = Array.from(processedSet);
  const maxKeep = 500;
  const trimmed = ids.length > maxKeep ? ids.slice(ids.length - maxKeep) : ids;
  PropertiesService.getScriptProperties().setProperty(CONFIG.processedPropertyKey, JSON.stringify(trimmed));
}

/**
 * Manual send by Drive Doc ID to a customer profile id, or an explicit TO list.
 *   sendDocById('DOC_ID', 'acme')
 *   sendDocById('DOC_ID', ['contact@example.com'])
 */
function sendDocById(docId, customerIdOrToList) {
  const file = DriveApp.getFileById(docId);
  let customer;

  if (Array.isArray(customerIdOrToList)) {
    customer = { id: 'manual', to: customerIdOrToList, cc: [] };
  } else if (typeof customerIdOrToList === 'string') {
    customer = CONFIG.customers.filter(function (c) {
      return c.id === customerIdOrToList;
    })[0];
    if (!customer) throw new Error('Unknown customer id: ' + customerIdOrToList);
  } else {
    throw new Error('Pass a customer id string or a TO email array');
  }

  deliverNotes_(file, customer, file.getName());
  const processed = loadProcessedIds_();
  processed.add(file.getId());
  saveProcessedIds_(processed);
  console.log('Manual send complete: ' + file.getName() + ' → ' + customer.to.join(', '));
}
