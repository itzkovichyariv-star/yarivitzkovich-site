// POST /api/journal-sync
// Receives JCR metrics from the Clarivate WOS Journals API (via GitHub Actions
// annual-journal-sync workflow) and upserts them into the journal_metrics D1 table.
//
// GET /api/journal-sync
// Owner-only: returns all stored journal metrics.
//
// Auth: x-qc-token: <QC_SECRET> (cron) or owner cookie (manual).

import { isOwner } from '../_lib/auth.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' },
  });
}

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const rows = (
    await env.DB
      .prepare('SELECT * FROM journal_metrics ORDER BY jcr_quartile ASC, impact_factor DESC')
      .all()
  ).results || [];

  return json({ ok: true, journals: rows });
};

export const onRequestPost = async ({ request, env }) => {
  const provided = request.headers.get('x-qc-token');
  const tokenOk  = env.QC_SECRET && provided === env.QC_SECRET;
  const cookieOk = !tokenOk && (await isOwner(request, env));
  if (!tokenOk && !cookieOk) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_body' }, 400); }

  const { journals } = body;
  if (!Array.isArray(journals) || journals.length === 0)
    return json({ ok: false, error: 'no_journals' }, 400);

  const nowTs = Math.floor(Date.now() / 1000);
  let stored = 0;

  for (const j of journals) {
    if (!j.journal_key) continue;
    await env.DB
      .prepare(
        `INSERT INTO journal_metrics
           (journal_key, journal_name, sjr, best_quartile, h_index, impact_factor, jcr_quartile, percentile, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(journal_key) DO UPDATE SET
           journal_name  = excluded.journal_name,
           sjr           = excluded.sjr,
           best_quartile = excluded.best_quartile,
           h_index       = excluded.h_index,
           impact_factor = excluded.impact_factor,
           jcr_quartile  = excluded.jcr_quartile,
           percentile    = COALESCE(excluded.percentile, journal_metrics.percentile),
           fetched_at    = excluded.fetched_at`
      )
      .bind(
        j.journal_key,
        j.journal_name,
        j.sjr          ?? null,
        j.best_quartile ?? null,
        j.h_index      ?? null,
        j.impact_factor ?? null,
        j.jcr_quartile  ?? null,
        j.percentile   ?? null,
        nowTs
      )
      .run();
    stored++;
  }

  return json({ ok: true, stored });
};
