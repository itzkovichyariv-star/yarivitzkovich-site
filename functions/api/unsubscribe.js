// GET /api/unsubscribe?token=...
//
// Linked from every notification email. Marks the subscriber as
// unsubscribed (status flips to 'unsubscribed', timestamps recorded).
// We keep the row so a future re-subscribe by the same email is still
// recognised as a returning relationship.

import { escapeHtml } from '../_lib/email.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return htmlResponse(500, page('Server misconfigured.'));

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token.length !== 64) {
    return htmlResponse(400, page('That unsubscribe link looks invalid.'));
  }

  const row = await env.DB
    .prepare(`SELECT id, email, status FROM subscribers WHERE unsubscribe_token = ?`)
    .bind(token)
    .first();

  if (!row) {
    return htmlResponse(404, page('That unsubscribe link is no longer valid.'));
  }

  if (row.status === 'unsubscribed') {
    return htmlResponse(200, page(`You're already unsubscribed.`, row.email));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(
      `UPDATE subscribers
       SET status = 'unsubscribed', unsubscribe_token = NULL, unsubscribed_at = ?
       WHERE id = ?`
    )
    .bind(nowSec, row.id)
    .run();

  return htmlResponse(200, page(`You've been unsubscribed.`, row.email));
};

function page(headline, email) {
  const emailLine = email
    ? `<p style="font-size: 15px; color: #6b6660;">Address: <strong>${escapeHtml(email)}</strong></p>`
    : '';
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(headline)} — Yariv Itzkovich</title>
  <style>body{font-family:Georgia,serif;background:#faf6ee;color:#1a1612;margin:0;padding:64px 24px;line-height:1.55;}main{max-width:520px;margin:0 auto;}</style>
</head><body><main>
  <h1 style="font-weight: 400; font-size: 28px; margin: 0 0 16px;">${escapeHtml(headline)}</h1>
  ${emailLine}
  <p style="font-size: 15px; color: #3d3a36; margin-top: 24px;">Sorry to see you go. If you change your mind, you can resubscribe any time at <a href="/subscribe" style="color: #1a1612;">yarivitzkovich.org/subscribe</a>.</p>
  <p style="margin-top: 32px;"><a href="/" style="font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #1a1612;">Back to the site →</a></p>
</main></body></html>`;
}

function htmlResponse(status, html) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
