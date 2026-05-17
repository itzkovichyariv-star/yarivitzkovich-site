// GET  /api/manage/contacts            — list submissions (owner-only)
// POST /api/manage/contacts             — { id, action: 'mark_read' | 'archive' | 'delete' }

import { isOwner } from '../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const result = await env.DB
    .prepare(
      `SELECT id, ts, name, email, message, country, country_name, status, read_at
       FROM contacts
       ORDER BY ts DESC
       LIMIT 200`
    )
    .all();

  const rows = result.results || [];
  const counts = { new: 0, read: 0, archived: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === 'new') counts.new++;
    else if (r.status === 'read') counts.read++;
    else if (r.status === 'archived') counts.archived++;
  }

  return json({ ok: true, counts, contacts: rows });
};

export const onRequestPost = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const id = Number(body?.id);
  const action = String(body?.action || '');
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'invalid_id' }, 400);

  if (action === 'mark_read') {
    await env.DB
      .prepare(`UPDATE contacts SET status = 'read', read_at = ? WHERE id = ? AND status = 'new'`)
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
    return json({ ok: true, status: 'read' });
  }
  if (action === 'archive') {
    await env.DB.prepare(`UPDATE contacts SET status = 'archived' WHERE id = ?`).bind(id).run();
    return json({ ok: true, status: 'archived' });
  }
  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM contacts WHERE id = ?`).bind(id).run();
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
