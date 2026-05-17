// /api/subscribe-confirm
//
// POST { token } → consumes the token and flips status to 'active'.
// This is the real confirmation path. The email link points at the
// Astro page /subscribe-confirm (which renders a button that POSTs
// here), so corporate email scanners (Outlook Safe Links, Mimecast,
// Proofpoint) — which GET links to scan for phishing — can't
// inadvertently consume the token before the user clicks.
//
// GET ?token=... → fallback for users on email clients that strip
// JavaScript or otherwise can't run the Astro page. Same logic as
// POST but accessible via plain navigation. Note this re-introduces
// the scanner-consumption risk; users on corporate mail should use
// the click-through flow served by /subscribe-confirm.

import { makeToken, escapeHtml, notifyOwner } from '../_lib/email.js';

async function consumeToken({ env, token }) {
  if (!env.DB) return { ok: false, error: 'no_db' };
  if (!token || token.length !== 64) return { ok: false, error: 'invalid_token' };

  const row = await env.DB
    .prepare(`SELECT id, email, status FROM subscribers WHERE confirm_token = ?`)
    .bind(token)
    .first();

  if (!row) {
    // Token not found — either invalid, used, or rotated. Check whether
    // an active subscriber exists with no confirm_token (we already
    // confirmed); we can't look them up by token in that case, but we
    // can return a friendly already-active signal if the caller hits
    // the endpoint a second time after success. For now, just signal
    // invalid_token; the page surfaces a sensible error to the user.
    return { ok: false, error: 'invalid_token' };
  }

  if (row.status === 'active') {
    return { ok: true, status: 'already_active', email: row.email };
  }
  if (row.status === 'unsubscribed') {
    return { ok: false, error: 'unsubscribed', email: row.email };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const unsubToken = await makeToken();
  await env.DB
    .prepare(
      `UPDATE subscribers
       SET status = 'active', confirm_token = NULL,
           unsubscribe_token = ?, confirmed_at = ?
       WHERE id = ?`
    )
    .bind(unsubToken, nowSec, row.id)
    .run();

  // Fire-and-forget owner notification — failures are logged but
  // never propagated to the user, who has already seen their own
  // confirmation succeed.
  await notifyOwner({
    env,
    subject: `New subscriber: ${row.email}`,
    html: `<p>A new subscriber just confirmed:</p>
<p><strong>${escapeHtml(row.email)}</strong></p>
<p><a href="https://yarivitzkovich.org/manage/subscribers">View all subscribers</a></p>`,
    text: `New subscriber confirmed: ${row.email}\n\nManage: https://yarivitzkovich.org/manage/subscribers`,
  });

  return { ok: true, status: 'confirmed', email: row.email };
}

export const onRequestPost = async ({ request, env }) => {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const token = String(body?.token || '');
  const result = await consumeToken({ env, token });

  if (!result.ok) {
    const status = result.error === 'invalid_token' ? 404
                 : result.error === 'unsubscribed' ? 410
                 : 500;
    return json({ ok: false, error: result.error, ...(result.email ? { email: result.email } : {}) }, status);
  }

  return json({ ok: true, status: result.status, email: result.email });
};

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const result = await consumeToken({ env, token });

  if (!result.ok) {
    if (result.error === 'invalid_token') {
      return htmlResponse(404, fallback('That confirmation link is no longer valid. If you still want to subscribe, please sign up again.'));
    }
    return htmlResponse(500, fallback('Something went wrong. Please try signing up again.'));
  }

  const msg = result.status === 'already_active'
    ? 'Your subscription was already active.'
    : "You're all set. You'll get a short email when a new paper goes up.";
  return htmlResponse(200, success(result.email, msg));
};

function success(email, msg) {
  return page('Subscription confirmed', `
    <h1 style="font-weight: 400; font-size: 28px; margin: 0 0 16px;">Subscription confirmed.</h1>
    <p style="font-size: 17px; color: #3d3a36;">${escapeHtml(msg)}</p>
    <p style="font-size: 15px; color: #6b6660;">Confirmed: <strong>${escapeHtml(email || '')}</strong></p>
    <p style="margin-top: 32px;"><a href="/" style="font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #1a1612;">Back to the site →</a></p>
  `);
}

function fallback(msg) {
  return page('Subscription', `
    <h1 style="font-weight: 400; font-size: 28px; margin: 0 0 16px;">Hmm.</h1>
    <p style="font-size: 17px; color: #3d3a36;">${escapeHtml(msg)}</p>
    <p style="margin-top: 32px;"><a href="/subscribe" style="font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #1a1612;">Try again →</a></p>
  `);
}

function page(title, inner) {
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} — Yariv Itzkovich</title>
  <style>body{font-family:Georgia,serif;background:#faf6ee;color:#1a1612;margin:0;padding:64px 24px;line-height:1.55;}main{max-width:520px;margin:0 auto;}</style>
</head><body><main>${inner}</main></body></html>`;
}

function htmlResponse(status, html) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
