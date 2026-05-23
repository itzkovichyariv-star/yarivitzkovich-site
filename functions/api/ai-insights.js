// GET  /api/ai-insights — return the last cached insight (owner-only)
// POST /api/ai-insights — generate a new insight via Claude API (owner-only)
//
// POST fetches citation data + download data from D1, calls Claude, and
// caches the result back in site_meta('ai_insight'). GET reads that cache.
//
// Requires env.ANTHROPIC_API_KEY to be set in Cloudflare Pages settings.
// Returns { ok: true, insight: "<markdown>", generated_at: <unix> }

import { isOwner } from '../_lib/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET — return cached insight
// ─────────────────────────────────────────────────────────────────────────────
export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const row = await env.DB.prepare("SELECT value FROM site_meta WHERE key = 'ai_insight'").first();
  if (!row) return json({ ok: false, error: 'no_insight' }, 404);

  try {
    const data = JSON.parse(row.value);
    return json({ ok: true, ...data });
  } catch {
    return json({ ok: false, error: 'parse_error' }, 500);
  }
};

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-7';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store, private' },
  });
}

function computeHIndex(papers) {
  const counts = papers.map((p) => p.citation_count).sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

export const onRequestPost = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'no_anthropic_key' }, 500);

  // ── Fetch citation cache ──────────────────────────────────────────────────
  const citationRows = (
    await env.DB.prepare(
      'SELECT paper_slug, doi, citation_count, self_citation_count, citing_papers_json, fetched_at FROM citation_cache ORDER BY citation_count DESC'
    ).all()
  ).results || [];

  if (citationRows.length === 0) {
    return json({ ok: false, error: 'no_citation_data' }, 400);
  }

  const papers = citationRows.map((r) => ({
    slug: r.paper_slug,
    doi: r.doi,
    citation_count: r.citation_count,
    self_citation_count: r.self_citation_count || 0,
    citing_papers: JSON.parse(r.citing_papers_json || '[]'),
  }));

  const hIndex    = computeHIndex(papers);
  const i10       = papers.filter((p) => p.citation_count >= 10).length;
  const totalSelf = papers.reduce((s, p) => s + p.self_citation_count, 0);
  const totalAll  = papers.reduce((s, p) => s + p.citation_count, 0);
  const selfPct   = totalAll > 0 ? Math.round((totalSelf / totalAll) * 100) : 0;

  // ── Fetch recent download counts per paper (last 365 days) ───────────────
  const sinceTs = Math.floor(Date.now() / 1000) - 365 * 86400;
  const dlRows = (
    await env.DB.prepare(
      `SELECT paper_slug, COUNT(*) AS downloads,
              GROUP_CONCAT(DISTINCT country_name) AS countries
       FROM events
       WHERE kind = 'download' AND is_bot = 0 AND ts >= ? AND paper_slug IS NOT NULL
       GROUP BY paper_slug`
    )
      .bind(sinceTs)
      .all()
  ).results || [];

  const dlMap = {};
  for (const r of dlRows) {
    dlMap[r.paper_slug] = {
      downloads: r.downloads,
      countries: (r.countries || '').split(',').filter(Boolean).slice(0, 10),
    };
  }

  // ── Build context string for Claude ──────────────────────────────────────
  const paperLines = papers
    .map((p) => {
      const dl = dlMap[p.slug] || { downloads: 0, countries: [] };
      const external = p.citation_count - p.self_citation_count;
      const topCiting = p.citing_papers
        .filter((c) => !(c.authors || []).some((a) => (a.name || '').toLowerCase().includes('itzkovich')))
        .slice(0, 4)
        .map(
          (c) =>
            `"${c.title || 'untitled'}" (${c.year || '?'})` +
            (c.authors?.[0]?.name ? ` — ${c.authors[0].name}` : '')
        )
        .join('; ');
      return (
        `• ${p.slug}: ${p.citation_count} total citations (${p.self_citation_count} self, ${external} external), ` +
        `${dl.downloads} download(s) last year` +
        (dl.countries.length ? `, downloaded from: ${dl.countries.join(', ')}` : '') +
        (topCiting ? `; external citing papers include: ${topCiting}` : '')
      );
    })
    .join('\n');

  const systemPrompt = `You are an academic research advisor helping a scholar named Yariv Itzkovich (Ariel University, Israel) understand the performance of his publications and identify concrete steps to increase citations and academic visibility.

You have access to real data from his personal academic website: download counts (tracked via site analytics), citation counts from Semantic Scholar broken down into self-citations (papers where Itzkovich is a co-author) and external citations, and citing paper metadata.

Your task: write an analytical narrative in plain English, in Markdown, structured as follows:
1. **Overview** — h-index (${hIndex}), i-10 index (${i10}), total citations (${totalAll}), self-citations (${totalSelf}, ${selfPct}% of total), external citations (${totalAll - totalSelf}). Briefly interpret the self-citation rate in the context of this field.
2. **Papers to Prioritize for Promotion** — which 2-3 papers have strong download interest but under-citations (especially external) relative to their age and potential? Why?
3. **Geographic Opportunities** — where are downloads concentrated vs where citing institutions are? Any mismatch worth addressing?
4. **Concrete Next Steps** — 4-6 specific, actionable recommendations (e.g., target a specific journal or conference, reach out to a specific research community, share in a specific venue, update the paper's abstract for discoverability)

Keep the tone professional but direct. Be specific — use paper names and numbers. Avoid vague advice.`;

  const userMessage = `Here is the current data for Yariv's papers:\n\n${paperLines}\n\nH-index: ${hIndex} | i-10: ${i10} | Total citations: ${totalAll} | Self-citations: ${totalSelf} (${selfPct}%) | External: ${totalAll - totalSelf}`;

  // ── Call Claude API ───────────────────────────────────────────────────────
  let insight;
  try {
    const claudeRes = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const txt = await claudeRes.text().catch(() => '');
      return json({ ok: false, error: `claude_${claudeRes.status}: ${txt.slice(0, 200)}` }, 502);
    }

    const claudeData = await claudeRes.json();
    insight = claudeData.content?.[0]?.text || '';
  } catch (err) {
    return json({ ok: false, error: `claude_fetch: ${err.message}` }, 502);
  }

  // ── Cache the insight in D1 (site_meta) so the page can load it fast ─────
  const nowTs = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO site_meta (key, value) VALUES ('ai_insight', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
    .bind(JSON.stringify({ insight, generated_at: nowTs }))
    .run();

  return json({ ok: true, insight, generated_at: nowTs });
};
