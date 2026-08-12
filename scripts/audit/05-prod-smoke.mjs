#!/usr/bin/env node
/**
 * 05-prod-smoke.mjs — read-only smoke test against the live site.
 *
 * Runs AFTER a deploy (or manually) to verify production isn't lying
 * about its health. This is the only cell file that hits the real
 * yarivitzkovich.org — all other cells run against a local dev server.
 *
 * Cell map (all GET, zero side effects):
 *   PROD-home              GET / -> 200, HTML
 *   PROD-publications      GET /publications -> 200 (308 -> /publications/ ok)
 *   PROD-hebrew            GET /he/ -> 200, HTML
 *   PROD-api-me            GET /api/me -> 200, JSON { owner: false }
 *                          (this is the canary for Pages Functions actually
 *                          executing — if it 404s, deploy is broken)
 *   PROD-live-totals       GET /live/totals -> 200, JSON with sinceLaunch
 *   PROD-live-events       GET /live/events?range=24h -> 200, JSON with events array
 *
 * Why GET-only: writing endpoints (/api/subscribe, /api/contact, etc)
 * would create rows in D1 + send real emails. The dev cells (03) mock
 * those. The prod cells stay strictly read-only.
 *
 * Opt-out: pass --skip-prod or set SKIP_PROD_SMOKE=1 to bypass this
 * file when you're iterating offline or don't want to hit the live
 * site for every gate run.
 */
import { Audit } from '../audit-lib.mjs';

if (process.env.SKIP_PROD_SMOKE === '1' || process.argv.includes('--skip-prod')) {
  console.log('+  0s [prod-smoke] SKIPPED (SKIP_PROD_SMOKE or --skip-prod)');
  process.exit(0);
}

const PROD = 'https://yarivitzkovich.org';
const audit = new Audit({ name: 'prod-smoke', baseUrl: PROD, noBrowser: true });
await audit.setup();

// Probe helper: GET URL with timeout, return { status, contentType, bodyHead, json }.
async function probe(path, { wantJson = false, timeoutMs = 10_000 } = {}) {
  const url = `${PROD}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    if (wantJson) {
      try { json = JSON.parse(text); } catch { /* leave null */ }
    }
    return {
      ok: r.ok,
      status: r.status,
      finalUrl: r.url,
      contentType: r.headers.get('content-type') || '',
      bodyHead: text.slice(0, 200),
      json,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

// ─── PROD-home ─────────────────────────────────────────────────────
{
  audit.log('PROD-home: GET / -> 200 HTML');
  const r = await probe('/');
  const isHtml = /text\/html/.test(r.contentType);
  const looksReal = /Yariv|Itzkovich/i.test(r.bodyHead);
  audit.recordCell({
    id: 'PROD-home',
    tableRef: 'GET https://yarivitzkovich.org/',
    expected: '200; text/html; body mentions Yariv or Itzkovich',
    observed: `status=${r.status}, contentType=${r.contentType.slice(0, 40)}, hasName=${looksReal}`,
    pass: !!r.ok && isHtml && looksReal,
    notes: !r.ok ? `Status ${r.status} ${r.error || ''}` :
           !isHtml ? `Wrong content-type: ${r.contentType}` :
           !looksReal ? 'Body does not mention Yariv/Itzkovich — wrong page deployed?' : '',
  });
}

// ─── PROD-publications ────────────────────────────────────────────
{
  audit.log('PROD-publications: GET /publications -> 200 (308 -> /publications/ ok)');
  const r = await probe('/publications');
  const isHtml = /text\/html/.test(r.contentType);
  audit.recordCell({
    id: 'PROD-publications',
    tableRef: 'GET /publications (follows redirect)',
    expected: 'final status 200, text/html',
    observed: `status=${r.status}, finalUrl=${r.finalUrl?.replace(PROD, '') ?? ''}, contentType=${r.contentType.slice(0, 40)}`,
    pass: !!r.ok && isHtml,
    notes: !r.ok ? `Status ${r.status} ${r.error || ''}` :
           !isHtml ? `Wrong content-type: ${r.contentType}` : '',
  });
}

// ─── PROD-hebrew ──────────────────────────────────────────────────
{
  audit.log('PROD-hebrew: GET /he/ -> 200 HTML');
  const r = await probe('/he/');
  const isHtml = /text\/html/.test(r.contentType);
  // Page is server-rendered with lang="he" dir="rtl". Verify the
  // markup contains both attrs so we'd catch a deploy that silently
  // dropped i18n.
  const hasLangAttr = /<html[^>]*lang="he"/.test(r.bodyHead) || r.bodyHead.includes('lang="he"');
  audit.recordCell({
    id: 'PROD-hebrew',
    tableRef: 'GET /he/',
    expected: '200; text/html; <html lang="he" ...>',
    observed: `status=${r.status}, hasLangHe=${hasLangAttr}`,
    pass: !!r.ok && isHtml && hasLangAttr,
    notes: !r.ok ? `Status ${r.status} ${r.error || ''}` :
           !hasLangAttr ? `/he/ served but lang="he" missing — i18n regression?` : '',
  });
}

// ─── PROD-api-me ──────────────────────────────────────────────────
// CANARY: if this 404s, the deploy is broken (Pages Functions not
// attached). Any non-owner visitor should get JSON { owner: false }.
{
  audit.log('PROD-api-me: GET /api/me -> 200 { owner: false }');
  const r = await probe('/api/me', { wantJson: true });
  const shapeOk = r.json && typeof r.json.owner === 'boolean';
  const nonOwnerSession = r.json?.owner === false;
  audit.recordCell({
    id: 'PROD-api-me',
    tableRef: 'GET /api/me (Pages Function canary)',
    expected: '200; application/json; body { owner: boolean }; non-owner session sees owner=false',
    observed: `status=${r.status}, body=${JSON.stringify(r.json).slice(0, 80)}`,
    pass: !!r.ok && shapeOk && nonOwnerSession,
    notes: !r.ok ? `Status ${r.status} — Pages Function may be unbound. ${r.error || ''}` :
           !shapeOk ? `Body shape wrong: ${r.bodyHead.slice(0, 100)}` :
           !nonOwnerSession ? `Got owner=true from a clean session — auth gate broken?` : '',
  });
}

// ─── PROD-live-totals ─────────────────────────────────────────────
{
  audit.log('PROD-live-totals: GET /live/totals -> JSON with sinceLaunch');
  const r = await probe('/live/totals', { wantJson: true });
  const hasSinceLaunch = r.json && typeof r.json.sinceLaunch === 'object' && r.json.sinceLaunch !== null;
  const hasTotal = hasSinceLaunch && typeof r.json.sinceLaunch.total === 'number';
  audit.recordCell({
    id: 'PROD-live-totals',
    tableRef: 'GET /live/totals',
    expected: '200; json with { sinceLaunch: { total: number, ... } }',
    observed: `status=${r.status}, sinceLaunch=${JSON.stringify(r.json?.sinceLaunch ?? null).slice(0, 100)}`,
    pass: !!r.ok && hasSinceLaunch && hasTotal,
    notes: !r.ok ? `Status ${r.status} — Pages Function or D1 binding broken? ${r.error || ''}` :
           !hasSinceLaunch ? `Missing sinceLaunch key. Body: ${r.bodyHead.slice(0, 120)}` :
           !hasTotal ? `sinceLaunch.total not a number.` : '',
  });
}

// ─── PROD-live-events ─────────────────────────────────────────────
{
  audit.log('PROD-live-events: GET /live/events?range=24h -> JSON with events array');
  const r = await probe('/live/events?range=24h', { wantJson: true });
  const hasEvents = r.json && Array.isArray(r.json.events);
  // The endpoint stopped echoing `range` when the period navigator landed
  // (2026-07-15): every request now resolves to explicit bounds and the
  // body returns { from, to }. A legacy relative ?range= leaves `to` null
  // and sets `from` to now-24h, so assert the window it actually resolved
  // to — that still proves the legacy param is honoured, which is the
  // thing this cell exists to catch.
  const nowTs = Math.floor(Date.now() / 1000);
  const from = r.json?.from;
  const agoSec = typeof from === 'number' ? nowTs - from : null;
  const windowOk = agoSec !== null && Math.abs(agoSec - 86400) <= 300;
  audit.recordCell({
    id: 'PROD-live-events',
    tableRef: 'GET /live/events?range=24h',
    expected: '200; json with { from: ~now-24h, to: null, events: [...] }',
    observed: `status=${r.status}, from=${from} (${agoSec ?? '—'}s ago), to=${r.json?.to}, eventsLen=${r.json?.events?.length}`,
    pass: !!r.ok && hasEvents && windowOk,
    notes: !r.ok ? `Status ${r.status} ${r.error || ''}` :
           !windowOk ? `24h window not honoured — from is ${agoSec ?? 'absent'}s ago, expected ~86400s.` :
           !hasEvents ? `events not an array. Body: ${r.bodyHead.slice(0, 120)}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
