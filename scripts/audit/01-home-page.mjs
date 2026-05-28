#!/usr/bin/env node
/**
 * 01-home.mjs — homepage smoke audit.
 *
 * Cell map:
 *   HOME-no-errors     Loading `/` produces zero console errors, zero
 *                      page errors, zero network failures (after the
 *                      audit-lib filters out known dev-server noise and
 *                      the owner-only /api/me 401).
 *   HOME-nav           Every desktop nav link visible on `/` resolves
 *                      to HTTP 200 (anchor-only links like #contact are
 *                      excluded; they're scroll targets, not navigations).
 */
import { Audit, fetchStatus } from '../audit-lib.mjs';

const audit = new Audit({ name: 'home' });
await audit.setup();

// ─── HOME-no-errors ─────────────────────────────────────────────────
audit.log('HOME-no-errors: load / and assert no console/page/network errors');
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(800);
  const after = await audit.shot('HOME-no-errors');
  const obs = audit.observerSnapshot();

  const httpOk = resp && resp.ok();
  const noConsole = obs.consoleErrors.length === 0;
  const noPage = obs.pageErrors.length === 0;
  const noNet = obs.netFailures.length === 0;
  const noBad = obs.badResponses.length === 0;

  audit.recordCell({
    id: 'HOME-no-errors',
    tableRef: 'GET / / no errors',
    expected: 'response 200; zero console errors; zero page errors; zero network failures; zero 4xx/5xx subresources',
    observed: `status=${resp?.status()}, console=${obs.consoleErrors.length}, page=${obs.pageErrors.length}, net=${obs.netFailures.length}, bad=${obs.badResponses.length}`,
    pass: httpOk && noConsole && noPage && noNet && noBad,
    after,
    notes: !httpOk ? `Homepage returned ${resp?.status()}` :
           !noBad ? `Bad subresource responses: ${obs.badResponses.slice(0, 5).join(' | ')}` :
           !noConsole ? `Console errors: ${obs.consoleErrors.slice(0, 3).map((e) => e.slice(0, 200)).join(' | ')}` :
           !noPage ? `Page errors: ${obs.pageErrors.slice(0, 3).join(' | ')}` :
           !noNet ? `Network failures: ${obs.netFailures.slice(0, 3).join(' | ')}` : '',
  });
}

// ─── HOME-nav ───────────────────────────────────────────────────────
// Pull every <a href> visible inside the top <header>, normalise to
// absolute URLs against baseUrl, drop pure anchors (#foo), dedupe, then
// HEAD/GET each and assert 200. This catches broken nav links — the
// single most common "oops shipped a bad route" regression.
audit.log('HOME-nav: every nav link resolves to 200');
{
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'domcontentloaded' });
  const before = await audit.shot('HOME-nav-before');

  // Get hrefs from links inside the <header>. Filter out anchors and
  // owner-only links (they're display:none for non-owners by design).
  const hrefs = await audit.page.$$eval('header a[href]', (els) =>
    els
      .filter((el) => !el.hasAttribute('data-owner-only'))
      .map((el) => el.getAttribute('href'))
      .filter(Boolean),
  );

  const seen = new Set();
  const checks = [];
  for (const href of hrefs) {
    // Drop pure-anchor or javascript: links.
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    // Strip in-page anchors (e.g. "/#now" -> "/").
    const cleanedPath = href.split('#')[0] || '/';
    const url = new URL(cleanedPath, audit.baseUrl).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    checks.push({ href, url });
  }

  audit.log(`  found ${checks.length} unique nav targets to probe`);
  const results = [];
  for (const c of checks) {
    const r = await fetchStatus(c.url);
    results.push({ ...c, ...r });
    audit.log(`    ${r.ok ? 'OK' : 'BAD'} ${r.status} ${c.href}`);
  }

  const after = await audit.shot('HOME-nav-after');
  const obs = audit.observerSnapshot();

  const allOk = results.length > 0 && results.every((r) => r.ok);
  const fails = results.filter((r) => !r.ok);

  audit.recordCell({
    id: 'HOME-nav',
    tableRef: '/ / Nav links all resolve',
    expected: `every visible nav link returns 200 (checked ${checks.length} unique targets)`,
    observed: `checked=${results.length}, ok=${results.length - fails.length}, failed=${fails.length}` +
      (fails.length ? ` (${fails.map((f) => `${f.href}=${f.status}`).join(', ')})` : ''),
    pass: allOk && obs.pageErrors.length === 0,
    before, after,
    notes: fails.length
      ? `Broken nav links: ${fails.map((f) => `${f.href} -> ${f.status}${f.error ? ' (' + f.error + ')' : ''}`).join('; ')}`
      : results.length === 0
        ? 'No nav links discovered — header markup may have changed.'
        : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
