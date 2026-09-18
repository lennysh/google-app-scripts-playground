/**
 * Meeting notes → customer Word email
 * ===================================================================
 * Edit this file for day-to-day behavior (customers, delivery, timing).
 */

const CONFIG = {
  // 'send' = email immediately; 'draft' = create Gmail drafts for review
  deliveryMode: 'draft',

  // Optional BCC on every outbound message
  bcc: '', // e.g. 'you@example.com'

  fromName: 'Your Name',

  // Wait after the Calendar event ends before exporting (Gemini needs time to finish the Doc)
  minAgeMinutes: 15,

  // Only consider Calendar events whose end time falls in this window
  lookbackHours: 168,

  // Calendar ID to scan ('primary' = your main calendar)
  calendarId: 'primary',

  // Folder names used when a notes Doc is not yet attached to the Calendar event
  meetFolderNames: ['Meet Recordings', 'Google Meet', 'Legacy Meet Recordings'],

  // How far from event end (minutes) a Meet-folder Doc may be to count as a fallback match
  driveFallbackWindowMinutes: 180,

  /**
   * Modular customer profiles.
   * A meeting matches a profile when ANY Calendar attendee email is in watchAttendees
   * (case-insensitive) OR the attendee domain is in watchDomains.
   *
   * When matched, the Word export is emailed to that profile's `to` list (and optional `cc`).
   * First matching profile wins if somehow more than one could apply.
   */
  customers: [
    {
      id: 'acme',
      name: 'Acme Corp',
      // Trigger: these people (or anyone else you add) are on the invite
      watchAttendees: [
        'contact@example.com',
      ],
      // Optional: treat any @example.com invitee as a match
      // watchDomains: ['example.com'],
      watchDomains: [],
      // Delivery: where the Word notes go
      to: [
        'contact@example.com',
      ],
      cc: [],
    },

    // Example — add another contact at the same customer, or a new customer:
    // {
    //   id: 'acme-other',
    //   name: 'Acme Corp (Other contact)',
    //   watchAttendees: ['someone.else@example.com'],
    //   watchDomains: [],
    //   to: ['someone.else@example.com', 'team-alias@example.com'],
    //   cc: ['you@example.com'],
    // },
  ],

  subjectTemplate: 'Meeting notes: {{title}} ({{when}})',

  // Plain-text fallback (clients that ignore HTML)
  bodyTemplate: [
    'Hi,',
    '',
    'Attached are the notes from our meeting as a Word document.',
    '',
    'Meeting: {{title}}',
    'When: {{when}}',
    '',
    'Thanks,',
    'Your Name',
  ].join('\n'),

  // HTML body — use <b>, <i>, <br>, <p>, etc. Placeholders: {{title}}, {{when}}
  htmlBodyTemplate: [
    '<p>Hi,</p>',
    '<p>Attached are the notes from our meeting as a Word document.</p>',
    '<p>',
    '<b>Meeting:</b> {{title}}<br>',
    '<b>When:</b> {{when}}',
    '</p>',
    '<p>Thanks,<br>Your Name</p>',
  ].join('\n'),

  maxEmailsPerRun: 5,
  processedPropertyKey: 'processedMeetingNoteIds',
};
