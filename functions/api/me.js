// GET /api/me
// Returns { owner: true|false } so the React component can decide whether
// to show the owner-only Details drawer button. The cookie is HttpOnly,
// so this round-trip is the only way for the client to ask "am I owner?".

import { isOwner } from '../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const owner = await isOwner(request, env);
  return new Response(JSON.stringify({ owner }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
};
