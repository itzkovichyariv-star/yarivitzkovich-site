// GET  /api/admin/subscribers       — list all subscribers (owner-only)
// POST /api/admin/subscribers       — manage a subscriber (owner-only)
//   body: { id: number, action: 'unsubscribe' | 'delete' }
//
// Used by the /admin/subscribers page to render the registration list
// and let the owner unsubscribe or hard-delete a row when needed.

import { isOwner } from '../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const result = await env.DB
    .prepare(
      `SELECT id, email, status, subscribed_at, confirmed_at, unsubscribed_at
       FROM subscribers
       ORDER BY subscribed_at DESC`
    )
    .all();

  const rows = result.results || [];
  const counts = {
    active: 0,
    pending: 0,
    unsubscribed: 0,
    total: rows.length,
  };
  for (const r of rows) {
    if (r.status === 'active') counts.active++;
    else if (r.status === 'pending') counts.pending++;
    else if (r.status === 'unsubscribed') counts.unsubscribed++;
  }

  return json({ ok: true, counts, subscribers: rows });
};

export const onRequestPost = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const id = Number(body?.id);
  const action = String(body?.action || '');
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'invalid_id' }, 400);

  if (action === 'unsubscribe') {
    const nowSec = Math.floor(Date.now() / 1000);
    await env.DB
      .prepare(
        `UPDATE subscribers
         SET status = 'unsubscribed', unsubscribe_token = NULL,
             confirm_token = NULL, unsubscribed_at = ?
         WHERE id = ?`
      )
      .bind(nowSec, id)
      .run();
    return json({ ok: true, status: 'unsubscribed' });
  }

  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM subscribers WHERE id = ?`).bind(id).run();
    return json({ ok: true, status: 'deleted' });
  }

  return json({ ok: false, error: 'invalid_action' }, 400);
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
