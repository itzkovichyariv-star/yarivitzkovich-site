// POST /api/auth-logout
// Clears the owner cookie. Useful on shared devices.

import { clearOwnerCookieHeader } from '../_lib/auth.js';

export const onRequestPost = async () => {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-store');
  headers.append('set-cookie', clearOwnerCookieHeader());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
