// GET /api/qc-log
// Owner-only. Returns the most recent quality-check log entries so the
// owner can verify the daily QC ran and review any findings.
//
// Query params:
//   limit — how many entries to return (default 30, max 200)

import { isOwner } from '../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: 'no_db_binding' }, 500);
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10) || 30));

  const result = await env.DB.prepare(
    `SELECT id, ts, total_events, visits, downloads, findings_json, fixes_json, duration_ms
     FROM qa_log
     ORDER BY ts DESC
     LIMIT ?`
  ).bind(limit).all();

  const rows = (result.results || []).map((r) => ({
    id: r.id,
    ts: r.ts,
    total_events: r.total_events,
    visits: r.visits,
    downloads: r.downloads,
    findings: safeParse(r.findings_json) || [],
    fixes: safeParse(r.fixes_json) || [],
    duration_ms: r.duration_ms,
  }));

  return json({ ok: true, count: rows.length, entries: rows });
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
