// POST /api/subscribe
//
// Double opt-in flow:
//   1. User submits email via the form on /subscribe.
//   2. We insert (or revive) a row in subscribers with status='pending'
//      and a random confirm_token.
//   3. We send a "please confirm" email containing a link to
//      /api/subscribe-confirm?token=...
//   4. The user clicks → that endpoint flips status to 'active'.
//
// Idempotency: re-submitting an already-pending email just resends the
// confirmation email (no duplicate rows). Re-submitting an already-
// active email returns ok with reason='already_subscribed'. Re-
// submitting an unsubscribed email re-arms a new pending cycle.

import { sendEmail, makeToken, escapeHtml } from '../_lib/email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const existing = await env.DB
    .prepare(`SELECT id, status FROM subscribers WHERE email = ?`)
    .bind(email)
    .first();

  // Already confirmed — nothing to do, return ok so the form can show
  // "you're already subscribed".
  if (existing && existing.status === 'active') {
    return json({ ok: true, status: 'already_subscribed' });
  }

  // Pending or unsubscribed — refresh / restart the confirmation cycle.
  const confirmToken = await makeToken();
  if (existing) {
    await env.DB
      .prepare(
        `UPDATE subscribers
         SET status = 'pending', confirm_token = ?, subscribed_at = ?,
             confirmed_at = NULL, unsubscribed_at = NULL, unsubscribe_token = NULL
         WHERE id = ?`
      )
      .bind(confirmToken, nowSec, existing.id)
      .run();
  } else {
    await env.DB
      .prepare(
        `INSERT INTO subscribers (email, status, confirm_token, subscribed_at)
         VALUES (?, 'pending', ?, ?)`
      )
      .bind(email, confirmToken, nowSec)
      .run();
  }

  // Send the confirmation email. If sending fails (e.g. RESEND_API_KEY
  // not configured yet), we still return ok so we don't leak the
  // failure to the user — the row sits as pending and a manual retry
  // can re-send later.
  const siteOrigin = new URL(request.url).origin;
  const confirmUrl = `${siteOrigin}/api/subscribe-confirm?token=${confirmToken}`;

  const result = await sendEmail({
    env,
    to: email,
    subject: 'Confirm your subscription to Yariv Itzkovich research updates',
    html: confirmationHtml(confirmUrl, email),
    text: confirmationText(confirmUrl, email),
  });

  return json({
    ok: true,
    status: 'pending_confirmation',
    email_send: result.ok ? 'sent' : 'failed',
    ...(result.ok ? {} : { email_send_error: result.error }),
  });
};

export const onRequest = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });

function confirmationHtml(confirmUrl, email) {
  const safeUrl = escapeHtml(confirmUrl);
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html><body style="font-family: Georgia, serif; line-height: 1.55; color: #1a1612; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <h2 style="font-weight: 400; font-size: 22px; margin-top: 0;">Confirm your subscription</h2>
  <p>Someone (hopefully you) asked to subscribe <strong>${safeEmail}</strong> to new-publication notifications from Yariv Itzkovich's research site.</p>
  <p>If that was you, click the link below to confirm:</p>
  <p style="margin: 28px 0;">
    <a href="${safeUrl}" style="display: inline-block; padding: 12px 20px; background: #1a1612; color: #faf6ee; text-decoration: none; border-radius: 999px; font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">Confirm subscription</a>
  </p>
  <p style="font-size: 13px; color: #6b6660;">Or paste this URL into your browser:<br><span style="font-family: ui-monospace, monospace; word-break: break-all;">${safeUrl}</span></p>
  <p style="font-size: 13px; color: #6b6660;">If you didn't ask to subscribe, just ignore this email — nothing happens unless you click the link.</p>
  <hr style="border: none; border-top: 1px solid #e8e2d5; margin: 32px 0 16px;">
  <p style="font-size: 12px; color: #8a857e;">Yariv Itzkovich · yarivitzkovich.org</p>
</body></html>`;
}

function confirmationText(confirmUrl, email) {
  return `Confirm your subscription

Someone (hopefully you) asked to subscribe ${email} to new-publication
notifications from Yariv Itzkovich's research site.

If that was you, confirm by opening this link:

${confirmUrl}

If you didn't ask to subscribe, just ignore this email.

— Yariv Itzkovich · yarivitzkovich.org
`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
