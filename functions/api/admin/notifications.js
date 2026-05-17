// GET /api/admin/notifications — past notification campaigns (owner-only)
//
// Returns the contents of notification_log so the owner can see which
// papers have been emailed about, when, and how many subscribers
// received the notification.

import { isOwner } from '../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const result = await env.DB
    .prepare(
      `SELECT id, paper_slug, paper_title, ts, sent_count, error_count
       FROM notification_log
       ORDER BY ts DESC
       LIMIT 200`
    )
    .all();

  return json({ ok: true, entries: result.results || [] });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
