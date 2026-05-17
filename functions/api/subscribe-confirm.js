// GET /api/subscribe-confirm?token=...
//
// Linked from the confirmation email. Looks up the pending subscriber
// by token, flips them to 'active', rotates the token to a fresh
// unsubscribe_token, and renders a simple confirmation page.

import { makeToken, escapeHtml } from '../_lib/email.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return htmlResponse(500, fallback('Server misconfigured.'));

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token.length !== 64) {
    return htmlResponse(400, fallback('Invalid or expired confirmation link.'));
  }

  const row = await env.DB
    .prepare(`SELECT id, email, status FROM subscribers WHERE confirm_token = ?`)
    .bind(token)
    .first();

  if (!row) {
    return htmlResponse(404, fallback('That confirmation link is no longer valid. If you still want to subscribe, please sign up again.'));
  }

  if (row.status !== 'pending') {
    return htmlResponse(200, success(row.email, 'Your subscription was already active.'));
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

  return htmlResponse(200, success(row.email, "You're all set. You'll get a short email when a new paper goes up."));
};

function success(email, msg) {
  return page(`Subscription confirmed`, `
    <h1 style="font-weight: 400; font-size: 28px; margin: 0 0 16px;">Subscription confirmed.</h1>
    <p style="font-size: 17px; color: #3d3a36;">${escapeHtml(msg)}</p>
    <p style="font-size: 15px; color: #6b6660;">Confirmed: <strong>${escapeHtml(email)}</strong></p>
    <p style="margin-top: 32px;"><a href="/" style="font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #1a1612;">Back to the site →</a></p>
  `);
}

function fallback(msg) {
  return page(`Subscription`, `
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
