// GET  /api/citations?slug=X  — public, returns { citation_count } for one paper
// GET  /api/citations          — owner-only, full dump with h-index + i-10
// POST /api/citations          — owner or cron token; refreshes from Semantic Scholar
//
// POST body: { papers: [{ slug, doi?, title, year? }] }
// Papers with a DOI are looked up via the S2 batch endpoint (1 API call for
// all of them). Papers without a DOI use a per-paper title search (slower).
// Citing-paper detail is fetched individually only for papers that have > 0
// citations. This minimises total S2 API calls.
//
// Rate limits (without S2_API_KEY): 100 req / 5 min ≈ 1 req / 3 sec.
// Set env.S2_API_KEY (free registration at semanticscholar.org/product/api)
// to unlock much higher limits and use shorter delays.
//
// Cron: the GitHub Actions daily-citations workflow calls this endpoint with
// x-qc-token: <QC_SECRET>. It also sends an email when citation counts change.

import { isOwner } from '../_lib/auth.js';
import { notifyOwner, escapeHtml } from '../_lib/email.js';

const S2_BASE        = 'https://api.semanticscholar.org/graph/v1';
// Name fragment used to detect self-citations. A citing paper is a
// self-citation when at least one of its authors' names contains this string
// (case-insensitive). Adjust if the owner's name changes.
const OWNER_NAME_FRAGMENT = 'itzkovich';
// Delay between non-batch API calls. With S2_API_KEY a free key allows ~1 req/sec.
// Without it, stay conservative at 3.5 s to stay under the 100 req/5 min limit.
const DELAY_WITH_KEY = 1100;
const DELAY_NO_KEY   = 3500;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' },
  });
}

export function computeHIndex(papers) {
  const counts = papers.map((p) => p.citation_count).sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

// Count how many papers in a citing-papers array are self-citations.
// A self-citation is a paper where at least one author's name contains
// OWNER_NAME_FRAGMENT (case-insensitive).
function countSelfCitations(citingPapers) {
  let n = 0;
  for (const cp of citingPapers) {
    const isSelf = (cp.authors || []).some(
      (a) => (a.name || '').toLowerCase().includes(OWNER_NAME_FRAGMENT)
    );
    if (isSelf) n++;
  }
  return n;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function s2Headers(apiKey) {
  const h = { 'User-Agent': 'yarivitzkovich-site/1.0', 'content-type': 'application/json' };
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

async function s2Get(path, apiKey) {
  const r = await fetch(`${S2_BASE}${path}`, { headers: s2Headers(apiKey) });
  if (r.status === 404) return null;
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`S2 GET ${r.status}: ${txt.slice(0, 120)}`);
  }
  return r.json();
}

async function s2Post(path, body, apiKey) {
  const r = await fetch(`${S2_BASE}${path}`, {
    method: 'POST',
    headers: s2Headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`S2 POST ${r.status}: ${txt.slice(0, 120)}`);
  }
  return r.json();
}

// Pick the best title-search result: exact (case-insensitive) match wins;
// otherwise the result with the highest citation count.
function pickBestTitleMatch(results, targetTitle) {
  if (!results || results.length === 0) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
  const target = norm(targetTitle);
  const exact = results.find((r) => norm(r.title || '') === target);
  if (exact) return exact;
  return results.reduce((best, r) =>
    (r.citationCount || 0) > (best.citationCount || 0) ? r : best
  );
}

// Fetch up to 200 citing papers for a given S2 paper id
async function fetchCiting(s2Id, citationCount, apiKey, delay) {
  if (!s2Id || citationCount === 0) return [];
  const fields = 'citingPaper.title,citingPaper.year,citingPaper.authors,citingPaper.externalIds';

  await sleep(delay);
  const page1 = await s2Get(`/paper/${s2Id}/citations?fields=${fields}&limit=100&offset=0`, apiKey);
  let citing = (page1?.data || []).map((c) => c.citingPaper);

  if (citationCount > 100) {
    await sleep(delay);
    const page2 = await s2Get(`/paper/${s2Id}/citations?fields=${fields}&limit=100&offset=100`, apiKey);
    citing = citing.concat((page2?.data || []).map((c) => c.citingPaper));
  }

  return citing;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────
export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const slugParam = url.searchParams.get('slug');

  // Public single-paper badge endpoint (for "Cited by N" on paper pages)
  if (slugParam) {
    if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);
    const row = await env.DB
      .prepare('SELECT citation_count, fetched_at FROM citation_cache WHERE paper_slug = ?')
      .bind(slugParam)
      .first();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, slug: slugParam, citation_count: row.citation_count, fetched_at: row.fetched_at });
  }

  // Owner-only full dump
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const rows = (
    await env.DB
      .prepare('SELECT paper_slug, doi, semantic_scholar_id, citation_count, self_citation_count, citing_papers_json, fetched_at FROM citation_cache ORDER BY citation_count DESC')
      .all()
  ).results || [];

  const papers = rows.map((r) => ({
    ...r,
    citing_papers: JSON.parse(r.citing_papers_json || '[]'),
  }));

  const hIndex    = computeHIndex(papers);
  const i10       = papers.filter((p) => p.citation_count >= 10).length;
  const total     = papers.reduce((s, p) => s + p.citation_count, 0);
  const totalSelf = papers.reduce((s, p) => s + (p.self_citation_count || 0), 0);

  // GS-level metrics (set by /api/scholar-sync) — more accurate than computed values
  const gsMeta = await env.DB.prepare("SELECT value FROM site_meta WHERE key = 'gs_metrics'").first();
  const gsMetrics = gsMeta ? JSON.parse(gsMeta.value || '{}') : null;

  // Journal metrics (set by /api/journal-sync from Scimago)
  const journalRows = (
    await env.DB.prepare('SELECT journal_key, journal_name, sjr, best_quartile, h_index, impact_factor, jcr_quartile FROM journal_metrics').all()
  ).results || [];
  const journalMetrics = {};
  for (const j of journalRows) journalMetrics[j.journal_key] = j;

  return json({ ok: true, papers, hIndex, i10, totalCitations: total, totalSelfCitations: totalSelf, gsMetrics, journalMetrics });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST — refresh from Semantic Scholar
// ─────────────────────────────────────────────────────────────────────────────
export const onRequestPost = async ({ request, env }) => {
  const provided = request.headers.get('x-qc-token');
  const tokenOk  = env.QC_SECRET && provided === env.QC_SECRET;
  const cookieOk = !tokenOk && (await isOwner(request, env));
  if (!tokenOk && !cookieOk) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let papers;
  try {
    const body = await request.json();
    papers = body.papers;
    if (!Array.isArray(papers) || papers.length === 0) throw new Error('empty');
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }

  const apiKey = env.S2_API_KEY || null;
  const delay  = apiKey ? DELAY_WITH_KEY : DELAY_NO_KEY;
  const nowTs  = Math.floor(Date.now() / 1000);

  // Load previous citation counts for change detection
  const prevRows = (await env.DB.prepare('SELECT paper_slug, citation_count FROM citation_cache').all()).results || [];
  const prevCounts = {};
  for (const r of prevRows) prevCounts[r.paper_slug] = r.citation_count;

  // ── Phase 1: batch-lookup all papers that have DOIs ──────────────────────
  // S2 batch endpoint: 1 API call for up to 500 DOIs, returns paperId + citationCount.
  const doiPapers   = papers.filter((p) => p.doi);
  const titlePapers = papers.filter((p) => !p.doi);
  const s2MetaMap   = {}; // slug → { s2Id, count }

  if (doiPapers.length > 0) {
    try {
      const ids = doiPapers.map((p) => `DOI:${p.doi}`);
      const batchResults = await s2Post(
        '/paper/batch?fields=paperId,citationCount',
        { ids },
        apiKey
      );
      // S2 batch returns an array parallel to ids; null entries mean not found
      for (let i = 0; i < doiPapers.length; i++) {
        const meta = batchResults[i];
        if (meta && meta.paperId) {
          s2MetaMap[doiPapers[i].slug] = { s2Id: meta.paperId, count: meta.citationCount || 0 };
        } else {
          s2MetaMap[doiPapers[i].slug] = { s2Id: null, count: 0, notFound: true };
        }
      }
    } catch (err) {
      // If the batch call fails, mark all DOI papers as errors and continue
      for (const p of doiPapers) {
        s2MetaMap[p.slug] = { s2Id: null, count: 0, error: err.message };
      }
    }
  }

  // ── Phase 2: individual title searches for papers without DOI ─────────────
  for (const p of titlePapers) {
    try {
      await sleep(delay);
      const q   = encodeURIComponent(p.title);
      const res = await s2Get(`/paper/search?query=${q}&fields=paperId,citationCount,title&limit=5`, apiKey);
      const match = pickBestTitleMatch(res?.data, p.title);
      if (match) {
        s2MetaMap[p.slug] = { s2Id: match.paperId || null, count: match.citationCount || 0 };
      } else {
        s2MetaMap[p.slug] = { s2Id: null, count: 0, notFound: true };
      }
    } catch (err) {
      s2MetaMap[p.slug] = { s2Id: null, count: 0, error: err.message };
    }
  }

  // ── Phase 3: fetch citing papers for each paper that has citations ─────────
  const results  = [];
  const errors   = [];
  const notFound = [];
  const increased = [];

  for (const paper of papers) {
    const { slug, doi, title } = paper;
    const meta = s2MetaMap[slug];

    if (!meta) continue;

    if (meta.error) {
      errors.push({ slug, doi: doi || null, error: meta.error });
      continue;
    }

    if (meta.notFound) {
      notFound.push({ slug, title });
      continue;
    }

    const { s2Id, count } = meta;
    let citing = [];
    try {
      citing = await fetchCiting(s2Id, count, apiKey, delay);
    } catch (err) {
      errors.push({ slug, doi: doi || null, error: `citing fetch: ${err.message}` });
    }

    const selfCount = countSelfCitations(citing);

    await env.DB.prepare(
      `INSERT INTO citation_cache (paper_slug, doi, semantic_scholar_id, citation_count, self_citation_count, citing_papers_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(paper_slug) DO UPDATE SET
         doi                 = excluded.doi,
         semantic_scholar_id = excluded.semantic_scholar_id,
         citation_count      = excluded.citation_count,
         self_citation_count = excluded.self_citation_count,
         citing_papers_json  = excluded.citing_papers_json,
         fetched_at          = excluded.fetched_at`
    )
      .bind(slug, doi || null, s2Id, count, selfCount, JSON.stringify(citing), nowTs)
      .run();

    const prev = prevCounts[slug] ?? null;
    if (prev !== null && count > prev) {
      increased.push({ slug, title, prev, curr: count });
    }

    results.push({ slug, doi: doi || null, citation_count: count, citing_count: citing.length });
  }

  // ── Email alert on cron runs (token auth) when something noteworthy happens
  const shouldEmail = tokenOk && (increased.length > 0 || notFound.length > 0);
  if (shouldEmail) {
    const increaseHtml = increased
      .map((p) => `<li>${escapeHtml(p.title || p.slug)}: ${p.prev} → ${p.curr}</li>`)
      .join('');
    const missingHtml = notFound
      .map((p) => `<li>${escapeHtml(p.title || p.slug)}</li>`)
      .join('');

    await notifyOwner({
      env,
      subject: `Citations update: ${increased.length} increase(s)${notFound.length ? `, ${notFound.length} not found` : ''}`,
      html: [
        increased.length ? `<p><strong>Citation increases:</strong></p><ul>${increaseHtml}</ul>` : '',
        notFound.length ? `<p><strong>Not found on Semantic Scholar:</strong></p><ul>${missingHtml}</ul>` : '',
        '<p><a href="https://yarivitzkovich.org/manage/citations">View citation dashboard</a></p>',
      ].join(''),
      text: [
        increased.length ? `Increases:\n${increased.map((p) => `- ${p.title || p.slug}: ${p.prev} → ${p.curr}`).join('\n')}` : '',
        notFound.length ? `Not found:\n${notFound.map((p) => `- ${p.title || p.slug}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n'),
    });
  }

  return json({
    ok: true,
    refreshed: results.length,
    not_found: notFound.length,
    increases: increased,
    errors,
    results,
    not_found_list: notFound,
  });
};
