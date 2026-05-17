// POST /api/notify-new-paper
//
// Secret-token-protected endpoint. Called by the
// .github/workflows/notify-new-paper.yml workflow whenever a new file
// lands in src/content/publications/ (not _drafts/) on main.
//
// Payload: { paper_slug, paper_title, tldr?, venue?, year? }
//
// Behavior:
//   1. Idempotent — if notification_log already has a row for paper_slug,
//      we skip (so re-deploys don't double-mail).
//   2. Fetches every active subscriber, sends one personalized email
//      with their unsubscribe_token.
//   3. Records sent_count + error_count in notification_log.

import { sendEmail, escapeHtml, notifyOwner } from '../_lib/email.js';

export const onRequestPost = async ({ request, env }) => {
  // Reuse the QC_SECRET so the owner only manages one shared token.
  // (Both this endpoint and qc-run are triggered exclusively from
  // GitHub Actions on the owner's repo — collapsing them into one
  // secret keeps the setup story simpler.)
  const provided = request.headers.get('x-qc-token');
  if (!env.QC_SECRET) return json({ ok: false, error: 'no_secret_configured' }, 500);
  if (provided !== env.QC_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const slug = String(body?.paper_slug || '').trim();
  const title = String(body?.paper_title || '').trim();
  const tldr = String(body?.tldr || '').trim();
  const venue = String(body?.venue || '').trim();
  const year = body?.year ? String(body.year) : '';

  if (!slug || !title) return json({ ok: false, error: 'missing_fields' }, 400);

  // Idempotency check — bail early if we already mailed about this paper.
  const existing = await env.DB
    .prepare(`SELECT id, sent_count, ts FROM notification_log WHERE paper_slug = ?`)
    .bind(slug)
    .first();
  if (existing) {
    return json({
      ok: true,
      skipped: 'already_notified',
      previous_sent: existing.sent_count,
      previous_ts: existing.ts,
    });
  }

  // Fetch all active subscribers.
  const subs = (await env.DB
    .prepare(`SELECT email, unsubscribe_token FROM subscribers WHERE status = 'active' AND unsubscribe_token IS NOT NULL`)
    .all()).results || [];

  const siteOrigin = new URL(request.url).origin;
  const paperUrl = `${siteOrigin}/publications/${slug}/`;
  let sent = 0;
  let errors = 0;

  for (const s of subs) {
    const unsubUrl = `${siteOrigin}/api/unsubscribe?token=${s.unsubscribe_token}`;
    const r = await sendEmail({
      env,
      to: s.email,
      subject: `New paper: ${title}`,
      html: notificationHtml({ title, tldr, venue, year, paperUrl, unsubUrl }),
      text: notificationText({ title, tldr, venue, year, paperUrl, unsubUrl }),
    });
    if (r.ok) sent++; else errors++;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(
      `INSERT INTO notification_log (paper_slug, paper_title, ts, sent_count, error_count)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(slug, title, nowSec, sent, errors)
    .run();

  await notifyOwner({
    env,
    subject: `Campaign sent: "${title}" → ${sent} subscriber${sent === 1 ? '' : 's'}`,
    html: `<p>New-paper notification campaign just ran:</p>
<ul>
  <li><strong>Paper:</strong> <a href="${escapeHtml(paperUrl)}">${escapeHtml(title)}</a></li>
  <li><strong>Subscribers reached:</strong> ${sent}</li>
  ${errors > 0 ? `<li style="color:#b3411c"><strong>Failed deliveries:</strong> ${errors}</li>` : ''}
</ul>
<p><a href="https://yarivitzkovich.org/admin/notifications">View all campaigns</a></p>`,
    text: `Campaign sent\nPaper: ${title}\nSent: ${sent}\nErrors: ${errors}\n\nManage: https://yarivitzkovich.org/admin/notifications`,
  });

  return json({ ok: true, subscribers: subs.length, sent, errors });
};

function notificationHtml({ title, tldr, venue, year, paperUrl, unsubUrl }) {
  const t = escapeHtml(title);
  const safeTldr = tldr ? `<p style="font-size: 16px; line-height: 1.55; color: #3d3a36;">${escapeHtml(tldr)}</p>` : '';
  const safeMeta = (venue || year)
    ? `<p style="font-size: 14px; color: #6b6660; font-style: italic;">${[escapeHtml(venue), escapeHtml(year)].filter(Boolean).join(' · ')}</p>`
    : '';
  return `<!doctype html>
<html><body style="font-family: Georgia, serif; line-height: 1.55; color: #1a1612; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
  <p style="font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #8a857e; margin: 0 0 16px;">New paper · Yariv Itzkovich</p>
  <h2 style="font-weight: 400; font-size: 26px; line-height: 1.2; margin: 0 0 12px;"><a href="${escapeHtml(paperUrl)}" style="color: #1a1612; text-decoration: none;">${t}</a></h2>
  ${safeMeta}
  ${safeTldr}
  <p style="margin: 28px 0;">
    <a href="${escapeHtml(paperUrl)}" style="display: inline-block; padding: 12px 22px; background: #1a1612; color: #faf6ee; text-decoration: none; border-radius: 999px; font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">Read the paper →</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e8e2d5; margin: 32px 0 16px;">
  <p style="font-size: 12px; color: #8a857e;">
    You're receiving this because you subscribed at yarivitzkovich.org.
    <a href="${escapeHtml(unsubUrl)}" style="color: #8a857e;">Unsubscribe</a>.
  </p>
</body></html>`;
}

function notificationText({ title, tldr, venue, year, paperUrl, unsubUrl }) {
  return `New paper · Yariv Itzkovich

${title}
${[venue, year].filter(Boolean).join(' · ')}

${tldr || ''}

Read the paper: ${paperUrl}

—
Unsubscribe: ${unsubUrl}
`;
}

export const onRequest = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
