// POST /api/scholar-sync
// Receives pre-matched citation data from the GitHub Actions scholar-sync
// Python script and upserts it into citation_cache. Also stores the overall
// Google Scholar metrics (total citations, h-index, i10, since-2021 variants)
// in site_meta so the dashboard can display them directly.
//
// Auth: x-qc-token: <QC_SECRET> (cron) or owner cookie (manual trigger).

import { isOwner } from '../_lib/auth.js';
import { notifyOwner, escapeHtml } from '../_lib/email.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' },
  });
}

export const onRequestPost = async ({ request, env }) => {
  const provided = request.headers.get('x-qc-token');
  const tokenOk  = env.QC_SECRET && provided === env.QC_SECRET;
  const cookieOk = !tokenOk && (await isOwner(request, env));
  if (!tokenOk && !cookieOk) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_body' }, 400); }

  const { metrics, papers } = body;
  if (!Array.isArray(papers)) return json({ ok: false, error: 'no_papers' }, 400);

  const nowTs = Math.floor(Date.now() / 1000);

  // Persist GS-level metrics in site_meta (h-index, i10, totals + since-2021 + timeline)
  if (metrics) {
    const timeline = body.timeline || null;
    await env.DB
      .prepare(
        `INSERT INTO site_meta (key, value) VALUES ('gs_metrics', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .bind(JSON.stringify({ ...metrics, fetched_at: nowTs, ...(timeline ? { timeline } : {}) }))
      .run();
  }

  // Previous counts for change detection
  const prevRows = (await env.DB.prepare('SELECT paper_slug, citation_count FROM citation_cache').all()).results || [];
  const prevCounts = {};
  for (const r of prevRows) prevCounts[r.paper_slug] = r.citation_count;

  const updated  = [];
  const increased = [];

  for (const p of papers) {
    if (!p.slug) continue;

    // GS sync provides citation_count only. Preserve all existing citing-paper
    // data (self_citation_count, citing_papers_json) set by the S2 workflow —
    // overwriting them with empty arrays would destroy self-citation detection.
    await env.DB
      .prepare(
        `INSERT INTO citation_cache
           (paper_slug, doi, semantic_scholar_id, citation_count, self_citation_count, citing_papers_json, fetched_at)
         VALUES (
           ?,
           (SELECT doi FROM citation_cache WHERE paper_slug = ?),
           (SELECT semantic_scholar_id FROM citation_cache WHERE paper_slug = ?),
           ?,
           COALESCE((SELECT self_citation_count FROM citation_cache WHERE paper_slug = ?), 0),
           COALESCE((SELECT citing_papers_json  FROM citation_cache WHERE paper_slug = ?), '[]'),
           ?
         )
         ON CONFLICT(paper_slug) DO UPDATE SET
           citation_count = excluded.citation_count,
           fetched_at     = excluded.fetched_at`
      )
      .bind(p.slug, p.slug, p.slug, p.citation_count, p.slug, p.slug, nowTs)
      .run();

    const prev = prevCounts[p.slug] ?? null;
    if (prev !== null && p.citation_count > prev) {
      increased.push({ slug: p.slug, prev, curr: p.citation_count });
    }
    updated.push(p.slug);
  }

  // Email on citation increases (cron runs only)
  if (tokenOk && increased.length > 0) {
    const lines = increased
      .map((p) => `<li>${escapeHtml(p.slug)}: ${p.prev} → ${p.curr}</li>`)
      .join('');
    await notifyOwner({
      env,
      subject: `Google Scholar: ${increased.length} citation increase(s)`,
      html: `<p><strong>Citation increases (Google Scholar):</strong></p><ul>${lines}</ul>
             <p><a href="https://yarivitzkovich.org/manage/citations">View dashboard</a></p>`,
      text: increased.map((p) => `- ${p.slug}: ${p.prev} → ${p.curr}`).join('\n'),
    });
  }

  return json({ ok: true, updated: updated.length, increased: increased.length });
};
