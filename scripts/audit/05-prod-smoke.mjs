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
 *   PROD-api-me            GET /api/me -> 200, JSON { owner } equal to what
 *                          production's OWNER_IPS says about this runner's
 *                          address (this is the canary for Pages Functions
 *                          actually executing — if it 404s, deploy is broken)
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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { Audit, ROOT } from '../audit-lib.mjs';

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
// attached). The probe sends no cookie, so the owner flag can only come
// from OWNER_IPS, and it must be exactly what production's own rules say
// about this runner's address: true on one of Yariv's networks, false
// anywhere else. The cell used to demand a flat owner:false, which turned
// the gate red whenever it ran from his own wifi (2026-09-22) — production
// was right and the cell was wrong.
//
// The address is the one Cloudflare reports at /cdn-cgi/trace, read over
// the SAME TCP connection that then asks /api/me — Cloudflare sees one
// source address per connection, so that is the only way to know which
// address /api/me judged. Separate fetches are not enough: Happy Eyeballs
// picks IPv6 or IPv4 per connection, and on 2026-09-22 a trace went out
// over the home IPv4 (not an owner address) and the next one over IPv6.
//
// The rules are origin/main's — the branch production deploys — not the
// working tree's, so a branch that edits OWNER_IPS is judged against what
// is live until it ships. Without git, the working tree stands in.
function getOnConnection(agent, path) {
  return new Promise((resolve) => {
    const req = https.get(`${PROD}${path}`, { agent, timeout: 10_000 }, (res) => {
      const connection = `${res.socket.localAddress}:${res.socket.localPort}`;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', body, connection }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message, connection: null }));
  });
}

async function productionOwnerRules() {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let authSrc, toml, source;
  try {
    authSrc = git('show', 'origin/main:functions/_lib/auth.js');
    toml = git('show', 'origin/main:wrangler.toml');
    source = `origin/main@${git('rev-parse', '--short', 'origin/main').trim()}`;
  } catch {
    authSrc = readFileSync(`${ROOT}/functions/_lib/auth.js`, 'utf8');
    toml = readFileSync(`${ROOT}/wrangler.toml`, 'utf8');
    source = 'the working tree (origin/main unreadable)';
  }
  const { isOwner } = await import('data:text/javascript,' + encodeURIComponent(authSrc));
  const OWNER_IPS = toml.match(/^OWNER_IPS = "([^"]*)"/m)?.[1] ?? '';
  // No OWNER_SECRET in this env, so isOwner answers from the address alone.
  const ownerFor = (ip) => isOwner({ headers: new Headers({ 'cf-connecting-ip': ip }) }, { OWNER_IPS });
  return { ownerFor, source };
}

{
  audit.log("PROD-api-me: GET /api/me -> 200 { owner } as OWNER_IPS rules for this runner's address");
  const rules = await productionOwnerRules();
  // One keep-alive socket, so both requests share a connection. If the edge
  // closed it in between, the pair is retried rather than guessed at.
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  let trace, me;
  for (let attempt = 0; attempt < 3; attempt++) {
    trace = await getOnConnection(agent, '/cdn-cgi/trace');
    me = await getOnConnection(agent, '/api/me');
    if (trace.connection && trace.connection === me.connection) break;
  }
  agent.destroy();

  const ip = trace.body.match(/^ip=(.+)$/m)?.[1] ?? null;
  const oneConnection = !!trace.connection && trace.connection === me.connection;
  let json = null;
  try { json = JSON.parse(me.body); } catch { /* leave null */ }
  const httpOk = me.status === 200 && /application\/json/.test(me.contentType);
  const shapeOk = json && typeof json.owner === 'boolean';
  const expectedOwner = ip && oneConnection ? await rules.ownerFor(ip) : null;
  const ownerOk = expectedOwner !== null && json?.owner === expectedOwner;
  audit.recordCell({
    id: 'PROD-api-me',
    tableRef: 'GET /api/me (Pages Function canary)',
    expected: `200; application/json; body { owner: boolean }; owner=${expectedOwner ?? '?'} for ${ip ?? 'an unknown address'} per ${rules.source}`,
    observed: `status=${me.status}, body=${me.body.slice(0, 80)}, ip=${ip}, sameConnection=${oneConnection}`,
    pass: httpOk && shapeOk && ownerOk,
    notes: !httpOk ? `Status ${me.status} ${me.contentType} — Pages Function may be unbound. ${me.error || ''}` :
           !shapeOk ? `Body shape wrong: ${me.body.slice(0, 100)}` :
           !ip ? `Could not read this runner's address from /cdn-cgi/trace (status ${trace.status}), so the expected owner flag is unknown.` :
           !oneConnection ? `The trace and /api/me never shared a connection in 3 tries, so the address /api/me judged is unknown.` :
           !ownerOk ? `owner=${json.owner}, but ${rules.source} says ${expectedOwner} for ${ip} — ${expectedOwner ? 'network recognition broken in production?' : 'auth gate letting a stranger in?'}` : '',
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
