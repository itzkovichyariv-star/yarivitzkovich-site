// POST /api/contact
//
// Receives a contact-form submission, persists it to D1, and emails
// the owner via Resend so they don't have to refresh /manage/contacts
// to know a new message arrived.
//
// Lightweight protections:
//   - Required-field + length validation
//   - One submission per ip_hash per hour (cheap spam guard)
//   - Honeypot field "website" — bots tend to fill every field
//   - Skip recording if the submitter is the owner (testing) so the
//     real-contact list stays clean.

import { sendEmail, notifyOwner, escapeHtml } from '../_lib/email.js';
import { isOwner } from '../_lib/auth.js';
import { hashVisitor } from '../_lib/dedup.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_WINDOW_SEC = 3600;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  // Honeypot — if a "website" field is filled, the submitter is a bot.
  // Real form has no such field, so a human would never set it.
  if (body && typeof body.website === 'string' && body.website.length > 0) {
    return json({ ok: true, status: 'received' }); // pretend success
  }

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const message = String(body?.message || '').trim();

  if (!name || name.length > 120) return json({ ok: false, error: 'invalid_name' }, 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return json({ ok: false, error: 'invalid_email' }, 400);
  if (!message || message.length < 5 || message.length > 5000) {
    return json({ ok: false, error: 'invalid_message' }, 400);
  }

  // Skip the owner's own submissions (testing) — don't pollute the list.
  if (await isOwner(request, env)) {
    return json({ ok: true, status: 'received', skipped: 'owner' });
  }

  // Rate-limit: max 1 submission per ip_hash per hour. Reuses the
  // existing per-IP-daily hash machinery, scoped to kind='contact'
  // so it doesn't collide with visit/download hashes.
  const ipHash = await hashVisitor({ request, kind: 'contact', paper_slug: '' });
  const sinceTs = Math.floor(Date.now() / 1000) - RATE_WINDOW_SEC;
  const recent = await env.DB
    .prepare(`SELECT 1 FROM contacts WHERE ip_hash = ? AND ts >= ? LIMIT 1`)
    .bind(ipHash, sinceTs)
    .first();
  if (recent) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }

  // Geo enrichment — Cloudflare populates request.cf for free.
  const cf = request.cf || {};
  const country = cf.country || null;
  const countryName = cf.countryName || cf.country || null;
  const nowSec = Math.floor(Date.now() / 1000);

  await env.DB
    .prepare(
      `INSERT INTO contacts (ts, name, email, message, country, country_name, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(nowSec, name, email, message, country, countryName, ipHash)
    .run();

  // Email the owner — fire-and-forget; the visitor's success doesn't
  // hinge on whether Resend delivers cleanly to OWNER_EMAIL.
  await notifyOwner({
    env,
    subject: `New contact from ${name}`,
    html: `<p>New contact-form submission:</p>
<ul>
  <li><strong>Name:</strong> ${escapeHtml(name)}</li>
  <li><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></li>
  ${countryName ? `<li><strong>From:</strong> ${escapeHtml(countryName)}</li>` : ''}
</ul>
<p style="font-size: 15px; color: #3d3a36; padding: 16px; background: #f3eddf; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(message)}</p>
<p><a href="https://yarivitzkovich.org/manage/contacts">View all contacts</a></p>
<p style="font-size: 12px; color: #8a857e;">Reply directly to this email or copy the address above.</p>`,
    text: `New contact from ${name} <${email}>${countryName ? ` (${countryName})` : ''}\n\n${message}\n\nManage: https://yarivitzkovich.org/manage/contacts`,
    replyTo: email,
  });

  return json({ ok: true, status: 'received' });
};

export const onRequest = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
