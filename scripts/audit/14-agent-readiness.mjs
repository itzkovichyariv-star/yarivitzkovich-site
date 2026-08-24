#!/usr/bin/env node
/**
 * 14-agent-readiness.mjs — the contract the site offers to AI agents and
 * crawlers, as opposed to the one it offers to a browser.
 *
 * Every cell here maps to something that was measured and found wanting
 * by an external agent-readiness audit (is-agentic.com, 2026-08-24), so
 * a red cell means a real regression in something that was explicitly
 * fixed, not a nice-to-have.
 *
 * Cell map:
 *   AGENT-404-status          Unknown paths return a real HTTP 404, not
 *                             a 200 carrying the app shell. This is the
 *                             soft-404 regression: Cloudflare Pages falls
 *                             back to index.html the moment dist/404.html
 *                             stops existing, and the failure is silent.
 *   AGENT-404-pointers        The 404 body names the recovery routes
 *                             (llms.txt, sitemap, RSS) an agent needs.
 *   AGENT-404-markdown        An agent asking for Markdown gets a
 *                             text/markdown 404, not HTML.
 *   AGENT-md-negotiation      Accept: text/markdown returns
 *                             text/markdown; charset=utf-8 on every
 *                             representative route.
 *   AGENT-md-vary             Both variants carry Vary: Accept — without
 *                             it a CDN serves whichever it cached first.
 *   AGENT-html-unchanged      A browser's Accept header, an absent one,
 *                             and a bare wildcard all still return HTML.
 *                             The regression cell for the feature: the
 *                             negotiation layer is only acceptable if it
 *                             is invisible to human visitors.
 *   AGENT-md-twins            The .md twin of each route is fetchable
 *                             directly and carries real content.
 *   AGENT-opaque-untouched    Assets, feeds, PDFs and API routes pass
 *                             through the middleware unmodified.
 *   AGENT-redirects-intact    Real redirects (/contact, /admin) still
 *                             redirect for Markdown clients too — only
 *                             the trailing-slash canonicalization is
 *                             short-circuited.
 *   AGENT-llms-txt            /llms.txt exists and follows the
 *                             llmstxt.org shape, including the
 *                             when-to-use guidance.
 *   AGENT-schema-org          An Organization node in the JSON-LD graph
 *                             carries both contactPoint and address.
 *   AGENT-home-no-js          The homepage's raw HTML — no JavaScript —
 *                             has one H1, 500+ characters, and a real
 *                             h1/h2/h3 outline rather than a flat list.
 *   AGENT-md-headers          The Markdown variant carries the same
 *                             security and cache headers as the HTML one.
 *   AGENT-trust-anchors       /about and /privacy each render 500+
 *                             characters of real content.
 *
 * HTTP-only: no browser needed, so this suite runs in about a second.
 * It requires the wrangler substrate (`wrangler pages dev dist`) because
 * every cell exercises functions/_middleware.js — under plain `astro dev`
 * Pages Functions do not execute and the suite skips itself rather than
 * reporting phantom reds.
 *
 * RUN IT AGAINST PRODUCTION AFTER DEPLOYING. Several cells assert
 * behaviour that belongs to the Cloudflare edge rather than to this repo
 * — chiefly that Pages serves dist/404.html with a real 404 instead of
 * falling back to index.html with a 200. `wrangler pages dev` emulates
 * that faithfully, but the deploy is what makes it true:
 *
 *   PLAYWRIGHT_BASE_URL=https://yarivitzkovich.org node scripts/audit/14-agent-readiness.mjs
 *
 * Every cell is a plain GET with no side effects, so this is safe to run
 * against the live site as often as you like. It also works against a
 * Pages branch-preview URL, which is the cheapest way to check a change
 * before it reaches the apex domain.
 */
import { Audit } from '../audit-lib.mjs';

const audit = new Audit({ name: 'agent-readiness', noBrowser: true });
await audit.setup();

const BASE = audit.baseUrl;

// Pages Functions don't run under `astro dev`, so there is no
// negotiation layer to test there. Skipping beats reporting reds that
// only mean "wrong substrate" (the same trap 05-prod-smoke documents).
const FUNCTIONS_RUN = audit.substrate !== 'astro';
if (!FUNCTIONS_RUN) {
  audit.log('SUBSTRATE is astro-dev — Pages Functions are not executing, so every cell here would be a phantom red.');
  audit.log('Re-run against `npx wrangler pages dev dist --port 4324` (or prod) to exercise the negotiation layer.');
}

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
const MARKDOWN_ACCEPT = 'text/markdown';

/** Routes that must have both an HTML and a Markdown representation. */
// '/live/' is deliberately in this list: /live is both an Astro page and
// the namespace of the /live/* Pages Functions, and an over-broad opaque
// prefix in the middleware silently took the page's Markdown variant down
// with the functions. The trailing-slash form is what the sitemap
// publishes, so it is the form that must be tested.
const NEGOTIABLE_ROUTES = ['/', '/about', '/privacy', '/publications', '/publications/academic-incivility', '/topics/incivility', '/he', '/live', '/live/'];

/** Paths the middleware must not touch at all. */
const OPAQUE_ROUTES = [
  { path: '/publications.xml', type: 'application/xml' },
  { path: '/papers-doi.json', type: 'application/json' },
  { path: '/robots.txt', type: 'text/plain' },
  { path: '/sitemap-index.xml', type: 'application/xml' },
  { path: '/llms.txt', type: 'text/plain' },
  { path: '/pdfs/cultivating-safer-climate.pdf', type: 'application/pdf' },
  // The other half of the /live split: these must stay JSON.
  { path: '/live/totals', type: 'application/json' },
  { path: '/live/events?range=all', type: 'application/json' },
];

const NONEXISTENT = ['/some-path-that-does-not-exist', '/pricing', '/api/docs', '/publications/no-such-paper-here'];

async function probe(path, { accept, redirect = 'manual', timeoutMs = 15_000 } = {}) {
  const headers = accept === null ? {} : { accept };
  // A bare fetch has no timeout. Against localhost that never mattered;
  // against production one stalled connection would hang the whole gate.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, { headers, redirect, signal: ctrl.signal });
    const contentType = r.headers.get('content-type') || '';
    const isBinary = /pdf|image|font|octet-stream/.test(contentType);
    return {
      status: r.status,
      contentType,
      vary: r.headers.get('vary') || '',
      location: r.headers.get('location') || '',
      nosniff: r.headers.get('x-content-type-options') || '',
      referrerPolicy: r.headers.get('referrer-policy') || '',
      cacheControl: r.headers.get('cache-control') || '',
      body: isBinary ? '' : await r.text(),
      bytes: isBinary ? (await r.arrayBuffer()).byteLength : 0,
    };
  } catch (e) {
    return { status: 0, contentType: '', vary: '', location: '', body: '', bytes: 0, nosniff: '', referrerPolicy: '', cacheControl: '', error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip tags so a character count reflects what a reader actually gets. */
function visibleText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  return (main ? main[0] : html)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function record(id, tableRef, expected, observed, pass, notes = '') {
  audit.recordCell({ id, tableRef, expected, observed, pass: FUNCTIONS_RUN ? pass : null, notes: FUNCTIONS_RUN ? notes : 'Skipped — Pages Functions not executing on this substrate.' });
}

// ─── AGENT-404-status ─────────────────────────────────────────────────
{
  const results = FUNCTIONS_RUN ? await Promise.all(NONEXISTENT.map((p) => probe(p, { accept: BROWSER_ACCEPT }))) : [];
  const bad = results.map((r, i) => ({ path: NONEXISTENT[i], status: r.status })).filter((r) => r.status !== 404);
  record(
    'AGENT-404-status',
    'GET <nonexistent path>',
    'every unknown path returns HTTP 404 (soft-404 fallback to index.html is gone)',
    results.length ? results.map((r, i) => `${NONEXISTENT[i]}=${r.status}`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `Soft-404 regression — these returned non-404: ${bad.map((b) => `${b.path}=${b.status}`).join(', ')}. Check that dist/404.html exists (src/pages/404.astro must build).` : ''
  );
}

// ─── AGENT-404-pointers ───────────────────────────────────────────────
{
  const r = FUNCTIONS_RUN ? await probe('/definitely-not-a-page', { accept: BROWSER_ACCEPT }) : null;
  const needles = ['llms.txt', 'sitemap-index.xml', 'publications.xml'];
  const missing = r ? needles.filter((n) => !r.body.includes(n)) : needles;
  record(
    'AGENT-404-pointers',
    'GET <nonexistent path> body',
    'the 404 body names llms.txt, the sitemap and the RSS feed so an agent can recover',
    r ? `status=${r.status}, found=${needles.filter((n) => r.body.includes(n)).join('/') || 'none'}` : 'n/a',
    !!r && r.status === 404 && missing.length === 0,
    missing.length ? `404 body is missing recovery pointers: ${missing.join(', ')}` : ''
  );
}

// ─── AGENT-404-markdown ───────────────────────────────────────────────
{
  const r = FUNCTIONS_RUN ? await probe('/definitely-not-a-page', { accept: MARKDOWN_ACCEPT }) : null;
  const isMarkdown = !!r && r.contentType.startsWith('text/markdown');
  const hasHeading = !!r && /^#|\n#/.test(r.body);
  const varyOk = !!r && /accept/i.test(r.vary);
  record(
    'AGENT-404-markdown',
    'GET <nonexistent path> with Accept: text/markdown',
    '404 status, text/markdown content type, a Markdown body, Vary includes Accept',
    r ? `status=${r.status}, type=${r.contentType || '(none)'}, vary=${r.vary || '(none)'}, heading=${hasHeading}` : 'n/a',
    !!r && r.status === 404 && isMarkdown && hasHeading && varyOk,
    !r ? '' : r.status !== 404 ? `Expected 404, got ${r.status}.` :
      !isMarkdown ? `Expected text/markdown, got "${r.contentType}".` :
      !hasHeading ? 'Markdown 404 body has no heading — /404.md may be missing.' :
      !varyOk ? `Vary is "${r.vary}" — must include Accept.` : ''
  );
}

// ─── AGENT-md-negotiation ─────────────────────────────────────────────
{
  const results = FUNCTIONS_RUN ? await Promise.all(NEGOTIABLE_ROUTES.map((p) => probe(p, { accept: MARKDOWN_ACCEPT }))) : [];
  const rows = results.map((r, i) => ({ path: NEGOTIABLE_ROUTES[i], ok: r.status === 200 && r.contentType.startsWith('text/markdown') && r.body.trim().length > 200, status: r.status, type: r.contentType, len: r.body.length }));
  const bad = rows.filter((row) => !row.ok);
  record(
    'AGENT-md-negotiation',
    'GET <route> with Accept: text/markdown',
    'every content route returns 200 text/markdown; charset=utf-8 with a non-trivial body',
    rows.length ? rows.map((row) => `${row.path}=${row.status}/${row.type.split(';')[0] || '?'}/${row.len}b`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `Not negotiating Markdown: ${bad.map((b) => `${b.path} → ${b.status} ${b.type || '(no type)'} ${b.len}b`).join(' | ')}` : ''
  );
}

// ─── AGENT-md-vary ────────────────────────────────────────────────────
{
  let mdVary = '';
  let htmlVary = '';
  if (FUNCTIONS_RUN) {
    mdVary = (await probe('/', { accept: MARKDOWN_ACCEPT })).vary;
    htmlVary = (await probe('/', { accept: BROWSER_ACCEPT })).vary;
  }
  const has = (v) => /(^|,)\s*accept\s*(,|$)/i.test(v);
  record(
    'AGENT-md-vary',
    'Vary header on both variants of /',
    'both the Markdown and the HTML variant send Vary containing Accept',
    `markdown="${mdVary || '(none)'}" html="${htmlVary || '(none)'}"`,
    has(mdVary) && has(htmlVary),
    !has(mdVary) ? `Markdown variant Vary is "${mdVary}" — a CDN will cross-serve the cached HTML.` :
      !has(htmlVary) ? `HTML variant Vary is "${htmlVary}" — a CDN will serve this HTML to a Markdown request.` : ''
  );
}

// ─── AGENT-html-unchanged ─────────────────────────────────────────────
// The regression cell. If this ever goes red, the negotiation layer is
// reaching human visitors and must be reverted, not patched.
{
  const cases = [
    { label: 'browser', accept: BROWSER_ACCEPT },
    { label: 'no-accept', accept: null },
    { label: 'wildcard', accept: '*/*' },
    { label: 'html-only', accept: 'text/html' },
    { label: 'md-below-html', accept: 'text/html,text/markdown;q=0.5' },
    { label: 'unknown-type', accept: 'application/vnd.pandoc' },
  ];
  const results = FUNCTIONS_RUN ? await Promise.all(cases.map((c) => probe('/', { accept: c.accept }))) : [];
  const rows = results.map((r, i) => ({ label: cases[i].label, ok: r.status === 200 && r.contentType.startsWith('text/html'), status: r.status, type: r.contentType.split(';')[0] }));
  const bad = rows.filter((row) => !row.ok);
  record(
    'AGENT-html-unchanged',
    'GET / with browser-shaped Accept headers',
    'every non-Markdown-preferring client still gets 200 text/html (and no 406)',
    rows.length ? rows.map((row) => `${row.label}=${row.status}/${row.type}`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `Human-visible regression — these no longer get HTML: ${bad.map((b) => `${b.label} → ${b.status} ${b.type}`).join(', ')}` : ''
  );
}

// ─── AGENT-md-twins ───────────────────────────────────────────────────
{
  const twins = ['/index.md', '/about.md', '/privacy.md', '/404.md', '/publications/academic-incivility.md'];
  const results = FUNCTIONS_RUN ? await Promise.all(twins.map((p) => probe(p, { accept: '*/*' }))) : [];
  const rows = results.map((r, i) => ({ path: twins[i], ok: r.status === 200 && r.contentType.startsWith('text/markdown') && r.body.length > 200, status: r.status, len: r.body.length }));
  const bad = rows.filter((row) => !row.ok);
  // A .md path that doesn't exist must still 404 rather than fall back.
  const missing = FUNCTIONS_RUN ? await probe('/no-such-twin.md', { accept: '*/*' }) : null;
  const missingOk = !missing || missing.status === 404;
  record(
    'AGENT-md-twins',
    'GET <route>.md',
    'each Markdown twin is directly fetchable as text/markdown; a nonexistent twin 404s',
    rows.length ? `${rows.map((row) => `${row.path}=${row.status}/${row.len}b`).join(' ')} missing-twin=${missing?.status}` : 'n/a',
    bad.length === 0 && missingOk,
    bad.length ? `Broken twins: ${bad.map((b) => `${b.path} → ${b.status} ${b.len}b`).join(', ')}. Did scripts/gen-markdown-twins.mjs run after astro build?` :
      !missingOk ? `/no-such-twin.md returned ${missing.status} instead of 404.` : ''
  );
}

// ─── AGENT-opaque-untouched ───────────────────────────────────────────
{
  const results = FUNCTIONS_RUN ? await Promise.all(OPAQUE_ROUTES.map((r) => probe(r.path, { accept: MARKDOWN_ACCEPT }))) : [];
  const rows = results.map((r, i) => ({
    path: OPAQUE_ROUTES[i].path,
    ok: r.status === 200 && r.contentType.startsWith(OPAQUE_ROUTES[i].type) && !/accept(?!-encoding)/i.test(r.vary),
    status: r.status,
    type: r.contentType.split(';')[0],
    vary: r.vary,
  }));
  const bad = rows.filter((row) => !row.ok);
  record(
    'AGENT-opaque-untouched',
    'GET <asset/feed/PDF> with Accept: text/markdown',
    'feeds, JSON, robots.txt, llms.txt and PDFs keep their own content type and gain no Vary: Accept',
    rows.length ? rows.map((row) => `${row.path}=${row.status}/${row.type}`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `Middleware is rewriting non-page responses: ${bad.map((b) => `${b.path} → ${b.status} ${b.type} vary="${b.vary}"`).join(' | ')}` : ''
  );
}

// ─── AGENT-redirects-intact ───────────────────────────────────────────
{
  const cases = [
    { path: '/contact', expect: 301 },
    { path: '/admin', expect: 301 },
  ];
  const asHtml = FUNCTIONS_RUN ? await Promise.all(cases.map((c) => probe(c.path, { accept: BROWSER_ACCEPT }))) : [];
  const asMd = FUNCTIONS_RUN ? await Promise.all(cases.map((c) => probe(c.path, { accept: MARKDOWN_ACCEPT }))) : [];
  const rows = cases.map((c, i) => ({
    path: c.path,
    ok: asHtml[i]?.status === c.expect && asMd[i]?.status === c.expect && asHtml[i]?.location === asMd[i]?.location,
    html: asHtml[i]?.status,
    md: asMd[i]?.status,
  }));
  const bad = rows.filter((row) => !row.ok);
  record(
    'AGENT-redirects-intact',
    'GET /contact and /admin under both Accept headers',
    'real _redirects rules still redirect identically for HTML and Markdown clients',
    rows.length ? rows.map((row) => `${row.path}: html=${row.html} md=${row.md}`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `A redirect was swallowed by the negotiation layer: ${bad.map((b) => `${b.path} html=${b.html} md=${b.md}`).join(', ')}` : ''
  );
}

// ─── AGENT-llms-txt ───────────────────────────────────────────────────
{
  const r = FUNCTIONS_RUN ? await probe('/llms.txt', { accept: '*/*' }) : null;
  const body = r?.body || '';
  const checks = {
    status200: r?.status === 200,
    h1: /^# .+/m.test(body),
    blockquote: /^> .+/m.test(body),
    whenToUse: /when to use/i.test(body),
    linkList: /^- \[[^\]]+\]\(https?:\/\/[^)]+\)/m.test(body),
    optional: /^## Optional$/m.test(body),
    absoluteLinks: !/^- \[[^\]]+\]\(\//m.test(body),
    substantial: body.length > 1500,
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  record(
    'AGENT-llms-txt',
    'GET /llms.txt',
    'llmstxt.org shape: H1, blockquote summary, when-to-use guidance, H2 link lists with absolute URLs, an Optional section',
    r ? `status=${r.status}, ${body.length}b, failed=[${failed.join(',') || 'none'}]` : 'n/a',
    failed.length === 0,
    failed.length ? `llms.txt is malformed — failing checks: ${failed.join(', ')}` : ''
  );
}

// ─── AGENT-schema-org ─────────────────────────────────────────────────
{
  const r = FUNCTIONS_RUN ? await probe('/', { accept: BROWSER_ACCEPT }) : null;
  let organizations = [];
  let personOk = false;
  let parseError = '';
  if (r) {
    try {
      const blocks = [...r.body.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const person = blocks.find((b) => b['@type'] === 'Person');
      personOk = !!person?.contactPoint && !!person?.address;
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        const type = node['@type'];
        if (typeof type === 'string' && /Organization|CollegeOrUniversity/.test(type)) {
          organizations.push({ name: node.name, contactPoint: !!node.contactPoint, address: !!node.address });
        }
        Object.values(node).forEach(walk);
      };
      blocks.forEach(walk);
    } catch (e) {
      parseError = e.message;
    }
  }
  const complete = organizations.filter((o) => o.contactPoint && o.address);
  record(
    'AGENT-schema-org',
    'JSON-LD on /',
    'at least one Organization node carries both contactPoint and address; the Person node carries both too',
    r ? `orgs=${organizations.length}, complete=${complete.length} (${complete.map((o) => o.name).join(', ') || 'none'}), person=${personOk}` : 'n/a',
    !parseError && complete.length > 0 && personOk,
    parseError ? `JSON-LD failed to parse: ${parseError}` :
      complete.length === 0 ? `No Organization node has both contactPoint and address. Found: ${organizations.map((o) => `${o.name}(cp=${o.contactPoint},addr=${o.address})`).join(', ')}` :
      !personOk ? 'Person node is missing contactPoint and/or address.' : ''
  );
}

// ─── AGENT-home-no-js ─────────────────────────────────────────────────
// The check an AI crawler runs: fetch the HTML, execute nothing, and see
// whether the page says anything. A JS-rendered homepage scores zero here.
{
  const r = FUNCTIONS_RUN ? await probe('/', { accept: BROWSER_ACCEPT }) : null;
  const html = r?.body || '';
  const text = visibleText(html);
  const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: Number(m[1]), text: m[2].replace(/<[^>]+>/g, '').trim() }));
  const h1s = headings.filter((h) => h.level === 1);
  const levels = new Set(headings.map((h) => h.level));

  // "Not flat" means the outline actually nests: every h2 in <main> is
  // followed by at least one h3 before the next h2. A page of sibling
  // h2s with no children is what reads as a flat document.
  const inMain = (() => {
    const main = html.match(/<main[\s\S]*?<\/main>/i);
    if (!main) return [];
    return [...main[0].matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => Number(m[1]));
  })();
  const childlessH2s = [];
  for (let i = 0; i < inMain.length; i += 1) {
    if (inMain[i] !== 2) continue;
    const next = inMain[i + 1];
    if (next !== 3) childlessH2s.push(i);
  }

  const pass = !!r && text.length >= 500 && h1s.length === 1 && levels.has(2) && levels.has(3) && childlessH2s.length === 0;
  record(
    'AGENT-home-no-js',
    'GET / raw HTML, no JavaScript executed',
    'one H1, 500+ chars of text in <main>, and a nested h1/h2/h3 outline (no childless h2)',
    r ? `chars=${text.length}, h1=${h1s.length}, levels=[${[...levels].sort().join(',')}], childless-h2=${childlessH2s.length}` : 'n/a',
    pass,
    !r ? '' :
      text.length < 500 ? `Only ${text.length} chars of server-rendered text — the homepage is not meaningfully readable without JS.` :
      h1s.length !== 1 ? `Expected exactly one H1, found ${h1s.length}: ${h1s.map((h) => h.text).join(' | ')}` :
      !levels.has(3) ? 'No H3 anywhere — the outline is flat.' :
      childlessH2s.length ? `${childlessH2s.length} H2 section(s) in <main> have no H3 children — the outline reads as flat.` : ''
  );
}

// ─── AGENT-md-headers ─────────────────────────────────────────────────
// The Markdown variant is a fresh Response built by the middleware, so it
// only carries the headers that code chooses to carry. Constructing one
// from scratch drops nosniff, the referrer policy and cache-control —
// a content-type change quietly becoming a policy regression. This cell
// asserts the Markdown variant is governed exactly like the HTML one.
{
  const html = FUNCTIONS_RUN ? await probe('/', { accept: BROWSER_ACCEPT }) : null;
  const md = FUNCTIONS_RUN ? await probe('/', { accept: MARKDOWN_ACCEPT }) : null;
  const compared = ['nosniff', 'referrerPolicy', 'cacheControl'];
  const mismatches = html && md ? compared.filter((k) => html[k] && html[k] !== md[k]) : compared;
  record(
    'AGENT-md-headers',
    'security + cache headers on the Markdown variant of /',
    'the Markdown variant carries the same x-content-type-options, referrer-policy and cache-control as the HTML variant',
    md ? `nosniff="${md.nosniff}" referrer-policy="${md.referrerPolicy}" cache-control="${md.cacheControl}"` : 'n/a',
    mismatches.length === 0,
    mismatches.length ? `Markdown variant drops headers the HTML variant sets: ${mismatches.map((k) => `${k} html="${html[k]}" md="${md[k]}"`).join(' | ')}` : ''
  );
}

// ─── AGENT-trust-anchors ──────────────────────────────────────────────
{
  const anchors = ['/about', '/privacy'];
  const results = FUNCTIONS_RUN ? await Promise.all(anchors.map((p) => probe(p, { accept: BROWSER_ACCEPT, redirect: 'follow' }))) : [];
  const rows = results.map((r, i) => {
    const text = visibleText(r.body);
    return { path: anchors[i], ok: r.status === 200 && text.length >= 500, status: r.status, chars: text.length };
  });
  const bad = rows.filter((row) => !row.ok);
  record(
    'AGENT-trust-anchors',
    'GET /about and /privacy',
    'each trust-anchor page returns 200 with at least 500 characters of content',
    rows.length ? rows.map((row) => `${row.path}=${row.status}/${row.chars}ch`).join(' ') : 'n/a',
    bad.length === 0,
    bad.length ? `Trust anchors below the 500-character bar AI agents check: ${bad.map((b) => `${b.path} → ${b.status} ${b.chars}ch`).join(', ')}` : ''
  );
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
