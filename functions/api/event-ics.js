// GET /api/event-ics
//
// Serves the information session as a calendar file. This is the "Outlook /
// Apple" half of add-to-calendar (Google gets a prefilled URL instead) and is
// linked from both the landing page and the confirmation email.
//
// Two details that break real calendar clients if you get them wrong:
//
//   1. Line folding. RFC 5545 caps a content line at 75 OCTETS, not
//      characters — and Hebrew is two bytes per letter in UTF-8, so a
//      description that looks short blows the limit and Outlook silently
//      drops the event. fold() below counts bytes and never splits a
//      multi-byte character.
//   2. CRLF. Every line ends \r\n. Apple Calendar accepts bare \n; Outlook
//      does not.

import { EVENT, toCalendarStamp, eventSummary } from '../../src/data/event.js';

/** Escape the characters RFC 5545 reserves inside a TEXT value. */
function esc(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold one content line to 75 octets, continuation lines prefixed with a
 * single space. Counts UTF-8 byte length per character so a Hebrew letter is
 * never cut in half (which renders as U+FFFD, or drops the event entirely).
 */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let current = '';
  let bytes = 0;
  // First line gets 75 octets; continuations lose one to the leading space.
  let limit = 75;
  for (const char of line) {
    const size = enc.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = char;
      bytes = size;
      limit = 74;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n');
}

export const onRequestGet = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const stamp = toCalendarStamp(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));

  const description = [
    `${EVENT.department}, ${EVENT.university}`,
    '',
    'נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.',
    `בשנת ${EVENT.academicYear} הלימודים יתקיימו בימי שלישי משעה 15:00, וביום שישי בזום.`,
    '',
    `קישור לזום: ${EVENT.zoomUrl}`,
    `פרטים: ${EVENT.pageUrl}`,
    '',
    EVENT.hosts.join(' · '),
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yarivitzkovich.org//event//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${EVENT.slug}@yarivitzkovich.org`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toCalendarStamp(EVENT.startUtc)}`,
    `DTEND:${toCalendarStamp(EVENT.endUtc)}`,
    `SUMMARY:${esc(eventSummary())}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(EVENT.zoomUrl)}`,
    `URL:${esc(EVENT.pageUrl)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // Two nudges: one the evening before, one just before it starts. People
    // register weeks ahead and a single same-hour alarm arrives too late to
    // rearrange an evening.
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`מחר: ${eventSummary()}`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(eventSummary())}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const body = lines.map(fold).join('\r\n') + '\r\n';

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${EVENT.slug}.ics"`,
      // The meeting details are fixed; let the edge cache them but keep the
      // window short enough that a corrected time propagates the same day.
      'cache-control': 'public, max-age=3600',
      'x-source': origin,
    },
  });
};
