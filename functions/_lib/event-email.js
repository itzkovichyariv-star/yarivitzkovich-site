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

import { escapeHtml } from './email.js';
import { EVENT, eventSummary, googleCalendarUrl } from '../../src/data/event.js';

const INK = '#1A1612';
const INK_SOFT = '#57504A';
const ACCENT = '#7A1E2B';
const CREAM = '#F4EFE6';
const LINE = '#E0D6C6';

// Re-exported so callers can pull both calendar URLs from one place.
export { googleCalendarUrl };

/** Our own .ics endpoint — Apple Calendar / Outlook / any desktop client. */
export function icsUrl(origin) {
  return `${origin}/api/event-ics`;
}

function pill(href, label, { solid = false } = {}) {
  const style = solid
    ? `display:inline-block;background:${ACCENT};color:${CREAM};text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:700`
    : `display:inline-block;border:1px solid ${LINE};color:${INK};text-decoration:none;padding:11px 20px;border-radius:999px;font-size:13px;font-weight:600`;
  return `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(label)}</a>`;
}

export function renderRegistrationEmail({ name, origin }) {
  const safeName = escapeHtml(name);
  const subject = `נרשמת למפגש הזום · ${EVENT.programme}`;

  const html = `<div dir="rtl" style="background:#ffffff;margin:0;padding:28px 20px;font-family:-apple-system,'Segoe UI',system-ui,Arial,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto">

  <!-- Invitation card, drawn in type so it survives image blocking -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border:1px solid ${LINE};border-radius:14px">
    <tr><td style="padding:30px 26px;text-align:center">
      <div style="font-size:11px;letter-spacing:0.08em;color:${ACCENT};font-weight:700;margin-bottom:16px">${escapeHtml(EVENT.university)} &middot; ${escapeHtml(EVENT.department)}</div>
      <div style="font-size:23px;line-height:1.3;font-weight:700;color:${ACCENT};margin-bottom:10px">${escapeHtml(EVENT.programme)}</div>
      <div style="font-size:14px;color:${INK};margin-bottom:20px">${escapeHtml(EVENT.kicker)} — הכירו את התכנית</div>
      <div style="border-top:1px solid ${LINE};margin:0 auto 20px;width:150px"></div>
      <div style="font-size:18px;font-weight:700;color:${ACCENT};line-height:1.5">${escapeHtml(EVENT.dateLabel)}<br>בשעה ${escapeHtml(EVENT.timeLabel)}</div>
      <div style="font-size:12px;color:${INK_SOFT};margin-top:14px">${escapeHtml(EVENT.hosts.join(' · '))}</div>
    </td></tr>
  </table>

  <p style="font-size:16px;line-height:1.65;margin:28px 0 6px">שלום ${safeName},</p>
  <p style="font-size:16px;line-height:1.65;color:${INK_SOFT};margin:0 0 22px">
    ההרשמה שלך למפגש נקלטה. שמרו את המייל הזה — קישור הזום נמצא כאן, וזה הקישור שבו תשתמשו ביום המפגש.
  </p>

  <!-- The Zoom link: as a button AND as bare text, because some clients strip <a> styling -->
  <div style="text-align:center;margin:0 0 10px">${pill(EVENT.zoomUrl, 'כניסה למפגש בזום', { solid: true })}</div>
  <p style="font-size:12px;color:${INK_SOFT};text-align:center;margin:0 0 26px;word-break:break-all">
    או העתיקו לדפדפן:<br><span dir="ltr" style="color:${INK}">${escapeHtml(EVENT.zoomUrl)}</span>
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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:${CREAM};border-radius:12px">
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
  ${question ? `<div style="margin-top:14px;padding:12px 14px;background:${CREAM};border-radius:10px;font-size:14px;line-height:1.6"><strong>שאלה שנשלחה מראש:</strong><br>${escapeHtml(question)}</div>` : ''}
  <p style="font-size:13px;color:${INK_SOFT};margin:18px 0 0">סה"כ נרשמים עד כה: <strong>${Number(total) || 0}</strong> · <a href="https://yarivitzkovich.org/manage/registrations" style="color:${ACCENT}">רשימת הנרשמים</a></p>
</div>`;
  return { subject: `נרשם/ת חדש/ה למפגש: ${name}`, html };
}
