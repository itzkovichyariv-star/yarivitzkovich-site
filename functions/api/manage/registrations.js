// GET  /api/manage/registrations            — list registrations (owner-only)
// GET  /api/manage/registrations?format=csv — download the same list for Excel
// POST /api/manage/registrations            — { id, action: 'delete' | 'resend' }
//
// Backs /manage/registrations. Owner-gated by the same cookie/IP check every
// other admin endpoint uses.

import { isOwner } from '../../_lib/auth.js';
import { sendEmail } from '../../_lib/email.js';
import { renderRegistrationEmail } from '../../_lib/event-email.js';
import { EVENT } from '../../../src/data/event.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const url = new URL(request.url);
  // Default to the current session but allow ?event=<slug> so past sessions
  // stay reachable after EVENT.slug moves on.
  const slug = url.searchParams.get('event') || EVENT.slug;

  const result = await env.DB
    .prepare(
      `SELECT id, name, email, phone, question, registered_at, updated_at, email_sent, send_count, source
       FROM event_registrations
       WHERE event_slug = ?
       ORDER BY registered_at DESC`
    )
    .bind(slug)
    .all();

  const rows = result.results || [];

  if (url.searchParams.get('format') === 'csv') {
    return csvResponse(rows, slug);
  }

  return json({
    ok: true,
    event: { slug, programme: EVENT.programme, dateLabel: EVENT.dateLabel, timeLabel: EVENT.timeLabel },
    counts: {
      total: rows.length,
      with_question: rows.filter((r) => r.question && String(r.question).trim()).length,
      email_failed: rows.filter((r) => !r.email_sent).length,
    },
    registrations: rows,
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const id = Number(body?.id);
  const action = String(body?.action || '');
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'invalid_id' }, 400);

  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM event_registrations WHERE id = ?`).bind(id).run();
    return json({ ok: true, status: 'deleted' });
  }

  // Re-send the joining details to one person — the fix for "it went to spam"
  // and for any row whose first send failed while Resend was down.
  if (action === 'resend') {
    const row = await env.DB
      .prepare(`SELECT name, email FROM event_registrations WHERE id = ?`)
      .bind(id)
      .first();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);

    const origin = new URL(request.url).origin;
    const mail = renderRegistrationEmail({ name: row.name, origin });
    const sent = await sendEmail({
      env,
      to: row.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: env.OWNER_EMAIL || undefined,
    });
    if (!sent.ok) return json({ ok: false, error: 'send_failed', detail: sent.detail || sent.error }, 502);

    await env.DB
      .prepare(`UPDATE event_registrations SET email_sent = 1, send_count = send_count + 1 WHERE id = ?`)
      .bind(id)
      .run();
    return json({ ok: true, status: 'resent' });
  }

  return json({ ok: false, error: 'invalid_action' }, 400);
};

/** RFC 4180 quoting: wrap in quotes, double any quote inside. */
function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvResponse(rows, slug) {
  const header = ['שם', 'אימייל', 'טלפון', 'שאלה', 'נרשם בתאריך', 'מייל אישור נשלח', 'מקור'];
  const lines = [header.map(cell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        cell(r.name),
        cell(r.email),
        cell(r.phone),
        // Keep the question readable in one cell: Excel treats a quoted
        // newline as a line break inside the cell, which is what we want.
        cell(r.question),
        cell(new Date((r.registered_at || 0) * 1000).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })),
        cell(r.email_sent ? 'כן' : 'לא'),
        cell(r.source),
      ].join(',')
    );
  }
  // The BOM is not decoration: without it Excel on Windows reads the file as
  // the local ANSI codepage and every Hebrew name arrives as mojibake.
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="registrations-${slug}.csv"`,
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
