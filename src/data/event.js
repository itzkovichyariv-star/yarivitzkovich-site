/**
 * The MA information session — SINGLE SOURCE OF TRUTH.
 *
 * Everything about the meeting lives here and only here: the landing page
 * (src/pages/he/ma-info.astro), the registration endpoint
 * (functions/api/event-register.js), the calendar file
 * (functions/api/event-ics.js) and the confirmation email
 * (functions/_lib/event-email.js) all import this object.
 *
 * Plain .js on purpose (not .ts): Astro/Vite bundles it for the page, and
 * esbuild bundles it for the Pages Functions. A .ts file would only be
 * reachable from one of the two, and a duplicated copy is exactly how a
 * meeting ends up advertised at two different times.
 *
 * TO MOVE THE MEETING: change `startUtc` / `endUtc` (real UTC instants) AND
 * the human-readable `dateLabel` / `timeLabel`. They are stored separately
 * because the page must render identical text on the server and in every
 * visitor's browser regardless of their device timezone — a viewer in Berlin
 * must still read "20:00", the Israeli local time, not 19:00.
 *
 *   2026-09-08T17:00:00Z === יום שלישי, 8 בספטמבר 2026, 20:00 שעון ישראל
 *   (Israel is on IDT / UTC+3 in September; DST runs to the last Sunday of October.)
 */

export const EVENT = {
  /** Stable identifier stored on every registration row. Bump for a new session. */
  slug: 'ma-info-2026-09',

  university: 'אוניברסיטת אריאל',
  department: 'המחלקה לסוציולוגיה ולאנתרופולוגיה',
  programme: 'תואר שני בייעוץ ארגוני וקהילתי',
  kicker: 'מפגש זום פתוח',

  /** Real instants — used for the .ics file and the Google Calendar link. */
  startUtc: '2026-09-08T17:00:00Z',
  endUtc: '2026-09-08T18:00:00Z',

  /** Frozen Israeli-local strings — never re-derived from the viewer's clock. */
  dateLabel: 'יום שלישי, 8 בספטמבר 2026',
  timeLabel: '20:00',
  timezoneNote: 'שעון ישראל',

  /** Yariv's permanent personal Zoom room. */
  zoomUrl: 'https://ariel-ac-il.zoom.us/j/3605379576',

  hosts: ["פרופ' מרים ביליג", 'ד"ר יריב איצקוביץ'],

  /** Canonical public URL — used in the email, the .ics and the share buttons. */
  pageUrl: 'https://yarivitzkovich.org/he/ma-info',

  /**
   * Same page, landing straight on the form.
   *
   * Used by anything a reader clicks AFTER they have already read the
   * invitation — the image in an email, the CTA button — because sending them
   * to the top of a page they just read costs a second click to reach the
   * thing they came for. Bare links that people may meet cold (the plain-text
   * URL, the link preview) still point at pageUrl, where the page explains
   * itself first. The fragment must match the section id on /he/ma-info.
   */
  registerUrl: 'https://yarivitzkovich.org/he/ma-info#registration',

  /** Term the programme starts in, as it appears in the invitation copy. */
  academicYear: 'תשפ"ז',
};

/** "20260908T170000Z" — the compact form both ICS and Google Calendar want. */
export function toCalendarStamp(iso) {
  return String(iso).replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** One-line summary reused by the email subject, the .ics and share text. */
export function eventSummary() {
  return `${EVENT.kicker} — ${EVENT.programme}`;
}

/**
 * Google Calendar's "add this event" URL, prefilled.
 *
 * Lives here rather than in the page or the email template because BOTH need
 * it, and a calendar link that disagrees with the .ics about the start time is
 * the kind of bug nobody notices until people show up an hour late.
 *
 * Written with no template literal nested inside another: Astro's frontmatter
 * parser mis-reads a multi-line template literal that contains one, and
 * swallows the rest of the page.
 */
export function googleCalendarUrl() {
  const details = [
    EVENT.department + ', ' + EVENT.university,
    '',
    'קישור לזום: ' + EVENT.zoomUrl,
    'פרטים: ' + EVENT.pageUrl,
  ].join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventSummary(),
    dates: toCalendarStamp(EVENT.startUtc) + '/' + toCalendarStamp(EVENT.endUtc),
    details,
    location: EVENT.zoomUrl,
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}
