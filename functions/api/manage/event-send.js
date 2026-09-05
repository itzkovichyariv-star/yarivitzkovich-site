// Send an event invitation to a list of people.
//
//   GET  /api/manage/event-send?slug=x  — who has already been sent this one
//   POST /api/manage/event-send         — { slug, recipients, test_only? }
//
// OWNER ONLY, ON PURPOSE
// ----------------------
// Every other landing-page endpoint also answers Emma, so Yariv can build a
// page by asking her over WhatsApp. This one does not. A mass mail-out is the
// one action here that cannot be taken back — no draft state, no undo, and the
// mistake lands in other people's inboxes rather than on a page he can edit. A
// message in a chat window is too thin a thing to start it with, so this needs
// him at a keyboard, looking at the list.
//
// WHY NOT THE SUBSCRIBER LIST
// ---------------------------
// `subscribers` opted in to hear about new papers. An invitation is a different
// thing to have agreed to, so recipients are given explicitly per send and that
// table is never read here.
//
// SENDING TWICE IS THE NORMAL CASE
// --------------------------------
// He sends to a department, then remembers the adjunct staff, and the second
// paste overlaps the first. event_sends has UNIQUE(event_slug, email), so
// anyone already invited is skipped rather than invited again — the endpoint
// reports them as `skipped` so the count still adds up.

import { isOwner } from '../../_lib/auth.js';
import { sendEmail } from '../../_lib/email.js';
import { renderEventInvitation } from '../../_lib/event-email.js';

// Resend's free tier allows 2 requests/second. Sending is one request per
// recipient (each gets their own name in the greeting), so a pause keeps a
// department-sized list inside the limit instead of half of it 429-ing.
const GAP_MS = 550;
const MAX_PER_CALL = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Parse whatever he pasted.
 *
 * Real lists arrive as "דנה כהן <dana@x.ac.il>", as "dana@x.ac.il, ron@y.org",
 * as one per line out of Excel, and as all three mixed. Anything without an
 * address is reported back rather than dropped, so a typo is visible instead of
 * silently uninvited.
 */
function parseRecipients(raw) {
  const out = [];
  const bad = [];
  const seen = new Set();

  const chunks = String(raw || '')
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const angled = chunk.match(/^(.*?)<([^>]+)>$/);
    const email = (angled ? angled[2] : chunk).trim().toLowerCase();
    const name = angled ? angled[1].trim().replace(/^["']|["']$/g, '') : '';
    if (!EMAIL_RE.test(email)) { bad.push(chunk); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name });
  }
  return { recipients: out, invalid: bad };
}

/** See functions/api/manage/events.js — the code deploys before the table exists. */
function migrationNeeded(err) {
  return /no such table/i.test(String(err?.message || err));
}

const MIGRATION_HELP = {
  ok: false,
  error: 'migration_needed',
  message: 'הטבלה של השליחות עדיין לא קיימת. הרץ את המיגרציה פעם אחת ואז רענן.',
  command: 'npx wrangler d1 migrations apply yarivitzkovich-events --remote',
};

export const onRequestGet = async (context) => {
  try {
    return await onRequestGetInner(context);
  } catch (err) {
    if (migrationNeeded(err)) return json(MIGRATION_HELP, 503);
    throw err;
  }
};

const onRequestGetInner = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return json({ ok: false, error: 'no_slug' }, 400);

  const { results } = await env.DB
    .prepare(`SELECT email, name, ts, status, error FROM event_sends WHERE event_slug = ? ORDER BY ts DESC`)
    .bind(slug)
    .all();

  const rows = results || [];
  return json({
    ok: true,
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status !== 'sent').length,
    recipients: rows,
  });
};

export const onRequestPost = async (context) => {
  try {
    return await onRequestPostInner(context);
  } catch (err) {
    if (migrationNeeded(err)) return json(MIGRATION_HELP, 503);
    throw err;
  }
};

const onRequestPostInner = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const slug = String(body?.slug || '').trim();
  if (!slug) return json({ ok: false, error: 'no_slug' }, 400);

  const event = await env.DB.prepare(`SELECT * FROM landing_events WHERE slug = ?`).bind(slug).first();
  if (!event) return json({ ok: false, error: 'unknown_event' }, 404);

  // A draft carries a "not published yet" banner. Mailing people to a page that
  // announces it is not ready is not a thing to let happen by accident.
  if (event.status === 'draft') {
    return json({
      ok: false,
      error: 'not_published',
      message: 'הדף עדיין טיוטה. שנה את המצב ל-published לפני שליחה — אחרת הנמענים יגיעו לדף שכתוב עליו שהוא לא פורסם.',
    }, 409);
  }

  const { recipients, invalid } = parseRecipients(body?.recipients);
  if (!recipients.length) {
    return json({
      ok: false,
      error: 'no_recipients',
      invalid,
      message: invalid.length
        ? 'לא זוהתה אף כתובת תקינה ברשימה.'
        : 'הרשימה ריקה.',
    }, 400);
  }

  const origin = new URL(request.url).origin;

  // A test send goes to him and is not recorded: it exists so he can see the
  // mail as a recipient sees it before anyone else does.
  if (body?.test_only) {
    const to = String(body?.test_to || env.OWNER_EMAIL || '').trim();
    if (!to) return json({ ok: false, error: 'no_test_address', message: 'אין כתובת לשליחת בדיקה (OWNER_EMAIL לא מוגדר).' }, 400);
    const mail = renderEventInvitation(event, { name: '', origin });
    const r = await sendEmail({ env, to, subject: `[בדיקה] ${mail.subject}`, html: mail.html, text: mail.text });
    return json({
      ok: !!r.ok,
      test: true,
      to,
      error: r.ok ? undefined : r.error,
      message: r.ok ? `נשלחה בדיקה ל-${to}. שום דבר לא נרשם ואיש לא קיבל כלום מלבדך.` : 'שליחת הבדיקה נכשלה.',
    }, r.ok ? 200 : 502);
  }

  // Who is genuinely new to this invitation.
  const { results: already } = await env.DB
    .prepare(`SELECT email FROM event_sends WHERE event_slug = ? AND status = 'sent'`)
    .bind(slug)
    .all();
  const have = new Set((already || []).map((r) => r.email));

  const fresh = recipients.filter((r) => !have.has(r.email));
  const skipped = recipients.length - fresh.length;

  if (!fresh.length) {
    return json({
      ok: true,
      sent: 0,
      skipped,
      invalid,
      message: skipped === 1
        ? 'הנמען היחיד ברשימה כבר קיבל את ההזמנה. לא נשלח שוב.'
        : `כל ${skipped} הנמענים ברשימה כבר קיבלו את ההזמנה. לא נשלח שוב.`,
    });
  }

  const batch = fresh.slice(0, MAX_PER_CALL);
  const results = { sent: 0, failed: 0, errors: [] };
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < batch.length; i++) {
    const person = batch[i];
    const mail = renderEventInvitation(event, { name: person.name, origin });
    const r = await sendEmail({ env, to: person.email, subject: mail.subject, html: mail.html, text: mail.text });

    // Recorded either way: a failure that leaves no trace is a failure he finds
    // out about from the person who never got it.
    await env.DB
      .prepare(
        `INSERT INTO event_sends (event_slug, email, name, ts, status, error)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_slug, email) DO UPDATE SET
           ts = excluded.ts, status = excluded.status, error = excluded.error`
      )
      .bind(slug, person.email, person.name || null, now, r.ok ? 'sent' : 'failed', r.ok ? null : String(r.error || 'send_failed'))
      .run();

    if (r.ok) results.sent++;
    else { results.failed++; if (results.errors.length < 5) results.errors.push({ email: person.email, error: r.error }); }

    if (i < batch.length - 1) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }

  const remaining = fresh.length - batch.length;
  return json({
    ok: true,
    sent: results.sent,
    failed: results.failed,
    skipped,
    invalid,
    remaining,
    errors: results.errors,
    message: [
      results.sent === 1 ? 'נשלחה הזמנה אחת.' : `נשלחו ${results.sent} הזמנות.`,
      results.failed ? (results.failed === 1 ? 'אחת נכשלה.' : `${results.failed} נכשלו.`) : '',
      skipped ? (skipped === 1 ? 'נמען אחד כבר קיבל קודם ולא נשלח שוב.' : `${skipped} נמענים כבר קיבלו קודם ולא נשלחו שוב.`) : '',
      invalid.length ? (invalid.length === 1 ? 'שורה אחת לא נראתה ככתובת ולא נשלחה.' : `${invalid.length} שורות לא נראו ככתובת ולא נשלחו.`) : '',
      remaining ? `נשארו ${remaining} — הרץ שוב כדי להמשיך.` : '',
    ].filter(Boolean).join(' '),
  });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
