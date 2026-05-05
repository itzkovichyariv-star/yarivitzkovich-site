// GET /api/auth-owner?owner=<secret>
// Establishes the owner session by checking the provided secret against the
// OWNER_SECRET env var. On match, sets an HMAC-signed cookie and redirects
// to /live so the secret doesn't linger in browser history.

import { signToken, setOwnerCookieHeader, AUTH_COOKIE_MAX_AGE_SEC } from '../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const provided = url.searchParams.get('owner');

  if (!env.OWNER_SECRET) {
    return new Response(
      'Owner mode unavailable: OWNER_SECRET env var is not set on this deployment.',
      { status: 503, headers: { 'content-type': 'text/plain' } }
    );
  }

  if (!provided || provided !== env.OWNER_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + AUTH_COOKIE_MAX_AGE_SEC;
  const token = await signToken(env.OWNER_SECRET, { scope: 'owner', exp });

  const headers = new Headers();
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.append('set-cookie', setOwnerCookieHeader(token));

  // Tiny success page that immediately redirects to /live, so the URL with
  // the secret never sticks in history beyond the brief redirect.
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=/live" />
  <title>Owner mode enabled</title>
  <style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:3rem;color:#1A1612;background:#F4EFE6}</style>
</head>
<body>
  <p>Owner mode enabled · valid for 30 days</p>
  <p><a href="/live">Continue to /live →</a></p>
</body>
</html>`;
  return new Response(body, { status: 200, headers });
};
