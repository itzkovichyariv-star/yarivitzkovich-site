// POST /api/qc-run
// Daily quality-check job. Triggered by the GitHub Actions cron (or
// manually by the owner). Secret-token-protected — the token must
// match env.QC_SECRET. Anyone hitting this endpoint without the
// correct token gets a 401.
//
// What it does:
//   1. Counts events grouped by kind and compares to the overall row count
//   2. Finds downloads with NULL paper_slug (data error)
//   3. Finds synthesized visits that have no matching download event
//   4. Backfills NULL paper_title where paper_slug points at a download
//      whose title is now known from a sibling download
//   5. Writes a qa_log row with findings + fixes for audit trail
//
// Auto-fixes are intentionally conservative — we never delete events.
// The QC just reports anomalies. The owner can review qa_log entries
// via /api/qc-log (owner-only) and decide whether to act.

import { notifyOwner, escapeHtml } from '../_lib/email.js';

const RECENT_PAIR_WINDOW_SEC = 5; // synth visit must pair with download within 5s

export const onRequestPost = async ({ request, env }) => {
  // Token auth — generated once by the owner, stored in Cloudflare Pages
  // env vars AND in the GitHub Actions secret.
  const provided = request.headers.get('x-qc-token');
  if (!env.QC_SECRET) {
    return json({ ok: false, error: 'no_secret_configured' }, 500);
  }
  if (!provided || provided !== env.QC_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: 'no_db_binding' }, 500);
  }

  const startedAt = Date.now();
  const findings = [];
  const fixes = [];

  // ────────────────────────────────────────────────────────────────────
  // CHECK 1 — overall counts add up
  // ────────────────────────────────────────────────────────────────────
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n;
  const visits = (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'visit'").first()).n;
  const downloads = (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'download'").first()).n;
  const other = total - visits - downloads;

  if (other !== 0) {
    findings.push(`event count mismatch: total=${total}, visits=${visits}, downloads=${downloads}, unaccounted=${other}`);
  }

  // ────────────────────────────────────────────────────────────────────
  // CHECK 2 — downloads must always have a paper_slug
  // ────────────────────────────────────────────────────────────────────
  const orphanDownloads = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE kind = 'download' AND (paper_slug IS NULL OR paper_slug = '')"
  ).first()).n;
  if (orphanDownloads > 0) {
    findings.push(`${orphanDownloads} downloads with NULL paper_slug`);
  }

  // ────────────────────────────────────────────────────────────────────
  // CHECK 3 — synthesized visits (page_path starts /pdfs/) must pair
  // with a download for the SAME paper_slug recorded within
  // RECENT_PAIR_WINDOW_SEC. We pair on ts + paper_slug rather than on
  // any hash, because the synth visit and its download intentionally
  // have DIFFERENT ip_hashes (ip_hash is salted by event kind).
  // ────────────────────────────────────────────────────────────────────
  const orphanSynthRows = (await env.DB.prepare(
    `SELECT v.id, v.ts, v.paper_slug
     FROM events v
     WHERE v.kind = 'visit'
       AND v.page_path LIKE '/pdfs/%'
       AND v.is_bot = 0
       AND NOT EXISTS (
         SELECT 1 FROM events d
         WHERE d.kind = 'download'
           AND d.paper_slug = v.paper_slug
           AND ABS(d.ts - v.ts) <= ?
       )
     LIMIT 20`
  ).bind(RECENT_PAIR_WINDOW_SEC).all()).results || [];
  if (orphanSynthRows.length > 0) {
    findings.push(`${orphanSynthRows.length} synthesized visits without paired download (sample ids: ${orphanSynthRows.slice(0, 5).map(r => r.id).join(',')})`);
  }

  // ────────────────────────────────────────────────────────────────────
  // CHECK 4 — orphan downloads: a download with NO visit by the same
  // person in the prior 24h. Uses person_hash (kind-agnostic, added in
  // migration 0002) so we correctly cross-match visit and download
  // events for the same person. Rows with NULL person_hash are
  // pre-0002 legacy data we can't reliably check, so they're skipped.
  // ────────────────────────────────────────────────────────────────────
  const orphanDl = (await env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM events d
     WHERE d.kind = 'download'
       AND d.is_bot = 0
       AND d.person_hash IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM events v
         WHERE v.kind = 'visit'
           AND v.person_hash = d.person_hash
           AND v.ts <= d.ts
           AND v.ts >= d.ts - 86400
       )`
  ).first()).n;
  if (orphanDl > 0) {
    findings.push(`${orphanDl} downloads without a paired visit in the prior 24h`);
  }

  // ────────────────────────────────────────────────────────────────────
  // AUTO-FIX 1 — backfill paper_title where it's NULL but another row
  // with the same paper_slug has a known title. Safe operation: we only
  // copy values that are already in the DB.
  // ────────────────────────────────────────────────────────────────────
  const titleBackfill = await env.DB.prepare(
    `UPDATE events
     SET paper_title = (
       SELECT paper_title FROM events e2
       WHERE e2.paper_slug = events.paper_slug
         AND e2.paper_title IS NOT NULL
         AND e2.paper_title != ''
       LIMIT 1
     )
     WHERE paper_slug IS NOT NULL
       AND paper_slug != ''
       AND (paper_title IS NULL OR paper_title = '')`
  ).run();
  const backfilled = titleBackfill.meta?.changes || 0;
  if (backfilled > 0) {
    fixes.push(`backfilled paper_title for ${backfilled} events`);
  }

  // ────────────────────────────────────────────────────────────────────
  // Write qa_log row
  // ────────────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startedAt;
  await env.DB.prepare(
    `INSERT INTO qa_log (ts, total_events, visits, downloads, findings_json, fixes_json, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Math.floor(Date.now() / 1000),
    total,
    visits,
    downloads,
    JSON.stringify(findings),
    JSON.stringify(fixes),
    durationMs,
  ).run();

  // Only email the owner when there's something to surface — daily
  // clean runs are silent so the inbox doesn't fill with "nothing to
  // see here" emails.
  if (findings.length > 0) {
    const findingsList = findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
    const fixesBlock = fixes.length > 0
      ? `<p><strong>Auto-fixes applied:</strong></p><ul>${fixes.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : '';
    await notifyOwner({
      env,
      subject: `QC: ${findings.length} finding${findings.length === 1 ? '' : 's'} (${total} events)`,
      html: `<p>Daily quality check found anomalies:</p>
<ul>${findingsList}</ul>
${fixesBlock}
<p><a href="https://yarivitzkovich.org/manage/qc">View full QC log</a></p>`,
      text: `QC findings (${findings.length}):\n${findings.map((f) => `- ${f}`).join('\n')}\n\nFull log: https://yarivitzkovich.org/manage/qc`,
    });
  }

  return json({
    ok: true,
    total_events: total,
    visits,
    downloads,
    findings,
    fixes,
    duration_ms: durationMs,
  });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
