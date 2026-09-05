// Hebrew confirmation email for an information-session registration.
//
// Deliberately image-free. Gmail, Outlook and Apple Mail all block remote
// images until the reader clicks "show images", so a header built from an
// <img> arrives as a grey box for most people. The card at the top is
// therefore drawn in type and table borders, which every client renders on
// first open.
//
// Everything is inline-styled and table-based for the same reason: <style>
// blocks and flex/grid are stripped or ignored by Outlook's Word renderer.
// dir="rtl" on the wrapper plus explicit text-align keeps the Hebrew right
// where it belongs even in clients that ignore dir.

import { googleCalendarUrl as dbGoogleCalendarUrl } from './event-page.js';

import { escapeHtml } from './email.js';
import { EVENT, eventSummary, googleCalendarUrl } from '../../src/data/event.js';

// Ariel University's campaign palette, the same one the landing page wears.
const INK = '#132238';
const INK_SOFT = '#4A5567';
const ACCENT = '#1F7F86';        // teal, darkened for AA contrast on white text
const TEAL_BRIGHT = '#4FBFC7';   // on the navy card only
const NAVY = '#122033';
const GREY = '#C1C3C6';
const TINT = '#EEF4F5';          // faint teal wash for the quiet blocks
const LINE = '#D8DEE2';

// Re-exported so callers can pull both calendar URLs from one place.
export { googleCalendarUrl };

/** Our own .ics endpoint — Apple Calendar / Outlook / any desktop client. */
export function icsUrl(origin) {
  return `${origin}/api/event-ics`;
}

function pill(href, label, { solid = false } = {}) {
  const style = solid
    ? `display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:700`
    : `display:inline-block;border:1px solid ${LINE};color:${INK};text-decoration:none;padding:11px 20px;border-radius:999px;font-size:13px;font-weight:600`;
  return `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(label)}</a>`;
}

export function renderRegistrationEmail({ name, origin }) {
  const safeName = escapeHtml(name);
  const subject = `נרשמת למפגש הזום · ${EVENT.programme}`;

  const html = `<div dir="rtl" style="background:#ffffff;margin:0;padding:28px 20px;font-family:-apple-system,'Segoe UI',system-ui,Arial,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto">

  <!-- Invitation card, drawn in type so it survives image blocking. Remote
       images are blocked by default in Gmail, Outlook and Apple Mail, so a
       header built from an <img> arrives as a grey box for most readers. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px">
    <tr><td style="padding:32px 26px">
      <div style="font-size:12px;letter-spacing:0.08em;color:${TEAL_BRIGHT};font-weight:600;margin-bottom:18px">${escapeHtml(EVENT.university)} &middot; ${escapeHtml(EVENT.department)}</div>
      <div style="font-size:25px;line-height:1.15;font-weight:800;color:${GREY};margin-bottom:6px">${escapeHtml(EVENT.kicker)}</div>
      <div style="font-size:25px;line-height:1.15;font-weight:800;color:${TEAL_BRIGHT};margin-bottom:22px">${escapeHtml(EVENT.programme)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(193,195,198,0.2);padding-top:6px;width:100%">
        <tr><td style="padding-top:18px">
          <div style="font-size:19px;font-weight:700;color:#ffffff;line-height:1.5">${escapeHtml(EVENT.dateLabel)}<br>בשעה ${escapeHtml(EVENT.timeLabel)} <span style="font-size:13px;font-weight:400;color:${GREY}">(${escapeHtml(EVENT.timezoneNote)})</span></div>
          <div style="font-size:13px;color:${GREY};margin-top:14px">${escapeHtml(EVENT.hosts.join(' · '))}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>

  <p style="font-size:16px;line-height:1.65;margin:28px 0 6px">שלום ${safeName},</p>
  <p style="font-size:16px;line-height:1.65;color:${INK_SOFT};margin:0 0 22px">
    ההרשמה שלך למפגש נקלטה. שמרו את המייל הזה — קישור הזום נמצא כאן, וזה הקישור שבו תשתמשו ביום המפגש.
  </p>

  <!-- The Zoom link: as a button AND as bare text, because some clients strip <a> styling -->
  <div style="text-align:center;margin:0 0 10px">${pill(EVENT.zoomUrl, 'כניסה למפגש בזום', { solid: true })}</div>
  <p style="font-size:12px;color:${INK_SOFT};text-align:center;margin:0 0 26px;word-break:break-all">
    או פתחו את הקישור ישירות:<br>
    <a href="${escapeHtml(EVENT.zoomUrl)}" dir="ltr" style="color:${ACCENT};font-weight:600;text-decoration:underline">${escapeHtml(EVENT.zoomUrl)}</a>
  </p>

  <!-- Add to calendar -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
    <tr><td style="padding:18px 20px">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">שמרו את המועד ביומן</div>
      <div style="font-size:13px;line-height:1.6;color:${INK_SOFT};margin-bottom:14px">
        כך תקבלו תזכורת אוטומטית מהיומן שלכם, והקישור לזום יופיע בתוך האירוע.
      </div>
      <div>
        ${pill(googleCalendarUrl(), 'Google Calendar')}
        &nbsp;
        ${pill(icsUrl(origin), 'Outlook / Apple')}
      </div>
    </td></tr>
  </table>

  <!-- What the programme looks like next year -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:${TINT};border-radius:12px">
    <tr><td style="padding:18px 20px">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">מה נעשה במפגש</div>
      <div style="font-size:14px;line-height:1.7;color:${INK_SOFT}">
        נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.<br>
        בשנת ${escapeHtml(EVENT.academicYear)} הלימודים יתקיימו בימי שלישי משעה 15:00, וביום שישי בזום.
      </div>
    </td></tr>
  </table>

  <p style="font-size:14px;line-height:1.65;color:${INK_SOFT};margin:24px 0 0">
    נשמח לראותכם.<br>
    ${escapeHtml(EVENT.hosts.join(' ו'))}
  </p>

  <p style="font-size:12px;line-height:1.6;color:#8A857E;margin:26px 0 0;border-top:1px solid ${LINE};padding-top:16px">
    אם לא נרשמתם למפגש הזה, אפשר פשוט להתעלם מהמייל — לא נשלח אליכם דבר נוסף.<br>
    לשאלות אפשר להשיב ישירות למייל הזה.
  </p>
</div>
</div>`;

  const text = `שלום ${name},

ההרשמה שלך ל${eventSummary()} נקלטה.

${EVENT.dateLabel}, בשעה ${EVENT.timeLabel} (${EVENT.timezoneNote})

קישור לזום:
${EVENT.zoomUrl}

הוספה ליומן:
Google — ${googleCalendarUrl()}
Outlook / Apple — ${icsUrl(origin)}

במפגש נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.
בשנת ${EVENT.academicYear} הלימודים יתקיימו בימי שלישי משעה 15:00, וביום שישי בזום.

נשמח לראותכם,
${EVENT.hosts.join(' ו')}

פרטים: ${EVENT.pageUrl}
`;

  return { subject, html, text };
}

/** Short admin notice — what Yariv sees the moment somebody registers. */
export function renderOwnerNotice({ name, email, phone, question, total }) {
  const row = (label, value) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:${INK_SOFT};font-size:13px;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px">${escapeHtml(value)}</td></tr>`
      : '';
  const html = `<div dir="rtl" style="font-family:-apple-system,system-ui,Arial,sans-serif;color:${INK};max-width:520px">
  <p style="font-size:15px;margin:0 0 14px">נרשם/ת חדש/ה למפגש <strong>${escapeHtml(EVENT.programme)}</strong>.</p>
  <table role="presentation" cellpadding="0" cellspacing="0">
    ${row('שם', name)}
    ${row('אימייל', email)}
    ${row('טלפון', phone)}
  </table>
  ${question ? `<div style="margin-top:14px;padding:12px 14px;background:${TINT};border-radius:10px;font-size:14px;line-height:1.6"><strong>שאלה שנשלחה מראש:</strong><br>${escapeHtml(question)}</div>` : ''}
  <p style="font-size:13px;color:${INK_SOFT};margin:18px 0 0">סה"כ נרשמים עד כה: <strong>${Number(total) || 0}</strong> · <a href="https://yarivitzkovich.org/manage/registrations" style="color:${ACCENT}">רשימת הנרשמים</a></p>
</div>`;
  return { subject: `נרשם/ת חדש/ה למפגש: ${name}`, html };
}

/**
 * The INVITATION email — the one that goes out to the mailing list, as
 * distinct from the confirmation somebody receives after registering.
 *
 * Every path in it leads to the landing page rather than trying to be the
 * landing page: an email client cannot run the registration form, and a page
 * can be updated after the mail has gone out. The Zoom link is deliberately
 * NOT here — it goes only to people who registered, so the room is not sitting
 * open in a forwarded mail.
 *
 * `source` is appended to the link as ?from=… so the registration rows record
 * which send brought each person in.
 */
export function renderInvitationEmail({ source = 'email' } = {}) {
  // ?from= before the fragment — a URL fragment must come last or the query
  // string is swallowed into it and the source is never recorded.
  const url = `${EVENT.pageUrl}?from=${encodeURIComponent(source)}#registration`;
  const safeUrl = escapeHtml(url);
  const subject = `הזמנה למפגש זום · ${EVENT.programme} · ${EVENT.dateLabel}`;

  const html = `<div dir="rtl" style="background:#ffffff;margin:0;padding:28px 20px;font-family:-apple-system,'Segoe UI',system-ui,Arial,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px">
    <tr><td style="padding:32px 26px">
      <div style="font-size:12px;letter-spacing:0.08em;color:${TEAL_BRIGHT};font-weight:600;margin-bottom:18px">${escapeHtml(EVENT.university)} &middot; ${escapeHtml(EVENT.department)}</div>
      <div style="font-size:25px;line-height:1.15;font-weight:800;color:${GREY};margin-bottom:6px">${escapeHtml(EVENT.kicker)}</div>
      <div style="font-size:25px;line-height:1.15;font-weight:800;color:${TEAL_BRIGHT};margin-bottom:22px">${escapeHtml(EVENT.programme)}</div>
      <div style="border-top:1px solid rgba(193,195,198,0.2);padding-top:18px">
        <div style="font-size:19px;font-weight:700;color:#ffffff;line-height:1.5">${escapeHtml(EVENT.dateLabel)}<br>בשעה ${escapeHtml(EVENT.timeLabel)} <span style="font-size:13px;font-weight:400;color:${GREY}">(${escapeHtml(EVENT.timezoneNote)})</span></div>
        <div style="font-size:13px;color:${GREY};margin-top:14px">${escapeHtml(EVENT.hosts.join(' · '))}</div>
      </div>
    </td></tr>
  </table>

  <p style="font-size:16px;line-height:1.65;margin:28px 0 16px">שלום רב,</p>
  <p style="font-size:16px;line-height:1.7;color:${INK_SOFT};margin:0 0 16px">
    שמחים להזמינך למפגש זום בנושא תכנית לתואר שני במחלקה לסוציולוגיה ולאנתרופולוגיה,
    עם התמחות בייעוץ ארגוני וקהילתי.
  </p>
  <p style="font-size:16px;line-height:1.7;color:${INK_SOFT};margin:0 0 16px">
    במפגש נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TINT};border-radius:12px;margin:0 0 24px">
    <tr><td style="padding:18px 20px">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">מתכונת הלימודים בשנת ${escapeHtml(EVENT.academicYear)}</div>
      <div style="font-size:14px;line-height:1.7;color:${INK_SOFT}">
        <strong>ימי שלישי</strong> — משעה 15:00, לימודים פרונטליים<br>
        <strong>ימי שישי</strong> — בזום
      </div>
    </td></tr>
  </table>

  <p style="font-size:16px;line-height:1.7;color:${INK_SOFT};margin:0 0 26px">
    זאת הזדמנות נוספת לקבל החלטה מושכלת, רגע לפני שמתחילה השנה החדשה.
  </p>

  <div style="text-align:center;margin:0 0 12px">
    <a href="${safeUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:999px;font-size:16px;font-weight:700">לפרטים ולהרשמה</a>
  </div>
  <p style="font-size:13px;color:${INK_SOFT};text-align:center;margin:0 0 28px">
    ההשתתפות ללא עלות · לאחר ההרשמה יישלח אליכם קישור הזום
  </p>
  <p style="font-size:15px;line-height:1.7;color:${INK};margin:0;border-top:1px solid ${LINE};padding-top:20px">
    ${escapeHtml(EVENT.hosts[0])}<br>ו${escapeHtml(EVENT.hosts[1])}
  </p>
</div>
</div>`;

  const text = `שלום רב,

שמחים להזמינך למפגש זום בנושא תכנית לתואר שני במחלקה לסוציולוגיה ולאנתרופולוגיה,
עם התמחות בייעוץ ארגוני וקהילתי.

במפגש נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.

${EVENT.dateLabel}, בשעה ${EVENT.timeLabel} (${EVENT.timezoneNote})

מתכונת הלימודים בשנת ${EVENT.academicYear}:
ימי שלישי — משעה 15:00, לימודים פרונטליים
ימי שישי — בזום

זאת הזדמנות נוספת לקבל החלטה מושכלת, רגע לפני שמתחילה השנה החדשה.

לפרטים ולהרשמה:
${url}

ההשתתפות ללא עלות. לאחר ההרשמה יישלח אליכם קישור הזום.

${EVENT.hosts[0]}
ו${EVENT.hosts[1]}
`;

  return { subject, html, text };
}


/**
 * Confirmation email for an event stored in the `landing_events` table.
 *
 * Deliberately separate from renderRegistrationEmail() above, which is frozen
 * around the September 2026 session: that mail is already in people's inboxes
 * and its wording is settled, so it is not worth risking to save a branch.
 * This one takes its every value from the row.
 *
 * Image-free for the same reason as the other: Gmail, Outlook and Apple Mail
 * all block remote images by default, so a header built from an <img> arrives
 * as a grey box for most readers.
 */
export function renderEventConfirmation(event, { name, origin }) {
  const pageUrl = `${origin}/e/${event.slug}`;
  const when = [event.date_label, event.time_label ? `בשעה ${event.time_label}` : '']
    .filter(Boolean)
    .join(', ');
  const hosts = String(event.hosts || '').split('\n').map((h) => h.trim()).filter(Boolean);
  const subject = `נרשמת · ${event.title}`;

  const joinBlock = event.join_url
    ? `
  <div style="text-align:center;margin:0 0 10px">
    <a href="${escapeHtml(event.join_url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:700;font-size:15px">כניסה למפגש</a>
  </div>
  <p style="font-size:12px;color:${INK_SOFT};text-align:center;margin:0 0 26px;word-break:break-all">
    או פתחו את הקישור ישירות:<br>
    <a href="${escapeHtml(event.join_url)}" dir="ltr" style="color:${ACCENT};font-weight:600">${escapeHtml(event.join_url)}</a>
  </p>`
    : `<p style="font-size:14px;color:${INK_SOFT};text-align:center;margin:0 0 26px">קישור ההצטרפות יישלח אליכם לקראת המפגש.</p>`;

  // Put it in the calendar, or the confirmation is just a message to lose.
  // Only offered when the event carries a real start instant: without one there
  // is nothing to write into a calendar entry, and a button that produces an
  // empty appointment is worse than no button.
  const icsUrl = `${origin}/api/event-ics?event=${encodeURIComponent(event.slug)}`;
  const calendarBlock = event.starts_at_utc
    ? `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
    <tr>
      <td align="center" style="padding:0 4px">
        <a href="${escapeHtml(dbGoogleCalendarUrl(event, origin))}" style="display:block;border:1px solid ${LINE};border-radius:999px;padding:11px 14px;font-size:13px;color:${INK_SOFT};text-decoration:none">הוספה ליומן Google</a>
      </td>
      <td align="center" style="padding:0 4px">
        <a href="${escapeHtml(icsUrl)}" style="display:block;border:1px solid ${LINE};border-radius:999px;padding:11px 14px;font-size:13px;color:${INK_SOFT};text-decoration:none">Outlook / Apple</a>
      </td>
    </tr>
  </table>`
    : '';

  const html = `<div dir="rtl" style="background:#ffffff;margin:0;padding:28px 20px;font-family:-apple-system,'Segoe UI',system-ui,Arial,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px">
    <tr><td style="padding:30px 26px">
      ${event.organisation || event.department ? `<div style="font-size:12px;letter-spacing:0.08em;color:${TEAL_BRIGHT};font-weight:600;margin-bottom:16px">${escapeHtml([event.organisation, event.department].filter(Boolean).join(' · '))}</div>` : ''}
      <div style="font-size:23px;line-height:1.2;font-weight:800;color:${TEAL_BRIGHT};margin-bottom:18px">${escapeHtml(event.title)}</div>
      ${when ? `<div style="border-top:1px solid rgba(193,195,198,0.2);padding-top:16px"><div style="font-size:18px;font-weight:700;color:#ffffff">${escapeHtml(when)}${event.timezone_note ? ` <span style="font-size:13px;font-weight:400;color:${GREY}">(${escapeHtml(event.timezone_note)})</span>` : ''}</div></div>` : ''}
      ${hosts.length ? `<div style="font-size:13px;color:${GREY};margin-top:12px">${escapeHtml(hosts.join(' · '))}</div>` : ''}
    </td></tr>
  </table>

  <p style="font-size:16px;line-height:1.65;margin:26px 0 6px">שלום ${escapeHtml(name)},</p>
  <p style="font-size:16px;line-height:1.65;color:${INK_SOFT};margin:0 0 22px">ההרשמה שלך נקלטה. שמרו את המייל הזה.</p>
  ${joinBlock}
  ${calendarBlock}
  <p style="font-size:12px;line-height:1.6;color:#8A939E;margin:26px 0 0;border-top:1px solid ${LINE};padding-top:16px">
    פרטי המפגש: <a href="${escapeHtml(pageUrl)}" style="color:${ACCENT}">${escapeHtml(pageUrl)}</a><br>
    אם לא נרשמתם, אפשר להתעלם מהמייל.
  </p>
</div>
</div>`;

  const text = `שלום ${name},

ההרשמה שלך ל${event.title} נקלטה.
${when}${event.timezone_note ? ` (${event.timezone_note})` : ''}
${event.join_url ? `\nקישור ההצטרפות:\n${event.join_url}\n` : '\nקישור ההצטרפות יישלח אליכם לקראת המפגש.\n'}
פרטים: ${pageUrl}
${event.starts_at_utc ? `הוספה ליומן: ${icsUrl}\n` : ''}${hosts.length ? `\n${hosts.join('\n')}` : ''}
`;

  return { subject, html, text };
}
