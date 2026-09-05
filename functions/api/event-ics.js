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

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const origin = url.origin;

  // ?event=<slug> serves a database event; no parameter keeps serving the
  // frozen September 2026 session, whose .ics is already in people's calendars.
  const slug = url.searchParams.get('event');
  if (slug) {
    if (!env?.DB) return new Response('not available', { status: 500 });
    // The calendar file carries the join link, and this endpoint is not gated:
    // knowing the slug is enough. That is deliberate. The link is kept off the
    // page so it cannot be scraped from HTML, but the invitation itself is sent
    // to a mailing list, so anyone who could guess the slug already had it. A
    // per-registrant token would buy nothing against that and would strand a
    // legitimate registrant whose token went missing.
    const row = await env.DB.prepare(`SELECT * FROM landing_events WHERE slug = ?`).bind(slug).first();
    if (!row || !row.starts_at_utc) return new Response('not found', { status: 404 });
    return icsResponse(buildIcs({
      uid: `${row.slug}@yarivitzkovich.org`,
      summary: row.title,
      description: [
        [row.department, row.organisation].filter(Boolean).join(', '),
        row.lede || '',
        row.join_url ? `קישור ההצטרפות: ${row.join_url}` : '',
        `פרטים: ${origin}/e/${row.slug}`,
      ].filter(Boolean).join('\n'),
      location: row.join_url || row.location_label || '',
      startUtc: row.starts_at_utc,
      endUtc: row.ends_at_utc || row.starts_at_utc,
      url: `${origin}/e/${row.slug}`,
    }), `${row.slug}.ics`);
  }

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

  return icsResponse(lines.map(fold).join('\r\n') + '\r\n', `${EVENT.slug}.ics`);
};

/** Same headers for both paths. */
function icsResponse(body, filename) {
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // Short enough that a corrected time propagates the same day, long
      // enough that a mail-out's arrivals do not each hit the database.
      'cache-control': 'public, max-age=3600',
    },
  });
}

/** Build a one-event calendar from plain values. */
function buildIcs({ uid, summary, description, location, startUtc, endUtc, url }) {
  const stamp = toCalendarStamp(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yarivitzkovich.org//event//HE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART:${toCalendarStamp(startUtc)}`, `DTEND:${toCalendarStamp(endUtc)}`,
    `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`,
    location ? `LOCATION:${esc(location)}` : null,
    url ? `URL:${esc(url)}` : null,
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc('מחר: ' + summary)}`, 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}
