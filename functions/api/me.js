// GET /api/me
// Returns { owner: true|false } so the React component can decide whether
// to show the owner-only Details drawer button. The cookie is HttpOnly,
// so this round-trip is the only way for the client to ask "am I owner?".
//
// AUTO-RENEW: when the cookie is valid, we issue a fresh 1-year cookie on
// every check. Since /live calls /api/me on every page load, this means as
// long as the owner visits the page at least once a year, the cookie
// effectively never expires — making "1 year" behave like "lifetime"
// without violating browser cookie-life limits (~400 days max anywhere).

import { isOwner, signToken, setOwnerCookieHeader, AUTH_COOKIE_MAX_AGE_SEC } from '../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const owner = await isOwner(request, env);
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });

  // Auto-renew the cookie on every owner check
  if (owner && env.OWNER_SECRET) {
    const exp = Math.floor(Date.now() / 1000) + AUTH_COOKIE_MAX_AGE_SEC;
    const fresh = await signToken(env.OWNER_SECRET, { scope: 'owner', exp });
    headers.append('set-cookie', setOwnerCookieHeader(fresh));
  }

  return new Response(JSON.stringify({ owner }), {
    status: 200,
    headers,
  });
};
