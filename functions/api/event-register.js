// POST /api/event-register
//
// One-step registration for a public information session. Unlike
// /api/subscribe there is no double opt-in: the visitor asked to attend a
// specific meeting, so the confirmation email carrying the Zoom link IS the
// confirmation. Making them click a second link would mean a share of
// registrants never receive the joining details at all.
//
// Re-registering the same address for the same event is not an error — it is
// how somebody who lost the email gets it again. The row is updated in place
// (UNIQUE(event_slug, email)) and the confirmation is re-sent.
//
// The response carries the Zoom link and the calendar URLs so the page can
// show them the instant registration lands, even if Resend is down. Losing
// the email must never mean losing the meeting.

import { sendEmail, notifyOwner } from '../_lib/email.js';
import { renderRegistrationEmail, renderOwnerNotice, googleCalendarUrl, icsUrl } from '../_lib/event-email.js';
import { EVENT } from '../../src/data/event.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = { name: 120, email: 200, phone: 40, question: 1000, source: 60 };

/** Trim, collapse runs of whitespace, and hard-cap the length. */
function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  // Honeypot. A real person never sees this field, so anything in it is a
  // bot. Answer with a normal-looking success so the bot has no signal to
  // adapt against — and write nothing to the database.
  if (String(body?.website || '').trim() !== '') {
    return json({ ok: true, status: 'registered', ...publicEventPayload(request) });
  }

  const name = clean(body?.name, LIMITS.name);
  const email = clean(body?.email, LIMITS.email).toLowerCase();
  const phone = clean(body?.phone, LIMITS.phone);
  // `question` keeps its line breaks — it is prose the reader will re-read
  // before the session, not a single-line field.
  const question = String(body?.question ?? '').trim().slice(0, LIMITS.question);
  const source = clean(body?.source, LIMITS.source);

  if (name.length < 2) return json({ ok: false, error: 'invalid_name' }, 400);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);

  const nowSec = Math.floor(Date.now() / 1000);
  const existing = await env.DB
    .prepare(`SELECT id, send_count FROM event_registrations WHERE event_slug = ? AND email = ?`)
    .bind(EVENT.slug, email)
    .first();

  if (existing) {
    await env.DB
      // Blank optional fields must not erase what they gave the first time.
      // Somebody who re-submits just name + email to get the joining email
      // re-sent would otherwise lose the phone number and the question they
      // had already written. NULLIF('') + COALESCE keeps the stored value
      // whenever the new submission leaves the field empty.
      .prepare(
        `UPDATE event_registrations
         SET name     = ?,
             phone    = COALESCE(NULLIF(?, ''), phone),
             question = COALESCE(NULLIF(?, ''), question),
             updated_at = ?
         WHERE id = ?`
      )
      .bind(name, phone, question, nowSec, existing.id)
      .run();
  } else {
    await env.DB
      .prepare(
        `INSERT INTO event_registrations (event_slug, name, email, phone, question, registered_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(EVENT.slug, name, email, phone || null, question || null, nowSec, source || null)
      .run();
  }

  const origin = new URL(request.url).origin;
  const mail = renderRegistrationEmail({ name, origin });
  const sent = await sendEmail({
    env,
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    // Replies go to Yariv, not into a no-reply void — the email invites
    // questions and people do answer it.
    replyTo: env.OWNER_EMAIL || undefined,
  });

  if (sent.ok) {
    await env.DB
      .prepare(
        `UPDATE event_registrations
         SET email_sent = 1, send_count = send_count + 1
         WHERE event_slug = ? AND email = ?`
      )
      .bind(EVENT.slug, email)
      .run();
  }

  // Owner ping — only for genuinely new registrations, so a re-send of a
  // lost email doesn't look like a second person signing up.
  if (!existing) {
    const total = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM event_registrations WHERE event_slug = ?`)
      .bind(EVENT.slug)
      .first();
    const notice = renderOwnerNotice({ name, email, phone, question, total: total?.n });
    // Never let a failed admin ping fail the registration itself.
    await notifyOwner({ env, subject: notice.subject, html: notice.html, replyTo: email }).catch(() => {});
  }

  return json({
    ok: true,
    status: existing ? 'already_registered' : 'registered',
    email_send: sent.ok ? 'sent' : 'failed',
    ...(sent.ok ? {} : { email_send_error: sent.error }),
    ...publicEventPayload(request),
  });
};

/** What the page needs to show the joining details without a second round-trip. */
function publicEventPayload(request) {
  const origin = new URL(request.url).origin;
  return {
    zoom_url: EVENT.zoomUrl,
    google_calendar_url: googleCalendarUrl(),
    ics_url: icsUrl(origin),
  };
}

export const onRequest = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
