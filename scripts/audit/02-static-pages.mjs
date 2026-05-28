#!/usr/bin/env node
/**
 * 02-static-pages.mjs — every top-level public page loads cleanly.
 *
 * Cell map:
 *   STATIC-<path>     Each enumerated route returns 200, fires zero
 *                     console/page/network errors, and has no 4xx/5xx
 *                     subresources. One cell per route, so a failure
 *                     points straight at the offending page.
 *
 * Pages probed: /about, /research, /teaching, /conferences, /live,
 * /publications, /subscribe. Hebrew tree handled in 04-hebrew.mjs.
 */
import { Audit } from '../audit-lib.mjs';

const audit = new Audit({ name: 'static-pages' });
await audit.setup();

// /live loads three.js + globe.gl + a D1-backed fetch — needs more
// settle time. Everything else is plain Astro static output.
const ROUTES = [
  { path: '/about', settleMs: 600 },
  { path: '/research', settleMs: 600 },
  { path: '/teaching', settleMs: 600 },
  { path: '/conferences', settleMs: 600 },
  { path: '/publications', settleMs: 800 },
  { path: '/subscribe', settleMs: 600 },
  { path: '/live', settleMs: 2500 },
];

for (const { path, settleMs } of ROUTES) {
  const cellId = `STATIC-${path.replace(/^\//, '').replace(/\//g, '-')}`;
  audit.log(`${cellId}: load ${path} and assert no errors`);
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
    .catch((e) => ({ _error: e.message }));
  if (resp && !resp._error) await audit.page.waitForTimeout(settleMs);
  const after = await audit.shot(cellId);
  const obs = audit.observerSnapshot();

  const httpOk = resp && !resp._error && resp.ok && resp.ok();
  const status = resp && !resp._error ? resp.status() : 'navigation-failed';
  const noConsole = obs.consoleErrors.length === 0;
  const noPage = obs.pageErrors.length === 0;
  const noNet = obs.netFailures.length === 0;
  const noBad = obs.badResponses.length === 0;
  const pass = !!httpOk && noConsole && noPage && noNet && noBad;

  audit.recordCell({
    id: cellId,
    tableRef: `GET ${path}`,
    expected: '200; zero console/page/network errors; zero 4xx/5xx subresources',
    observed: `status=${status}, console=${obs.consoleErrors.length}, page=${obs.pageErrors.length}, net=${obs.netFailures.length}, bad=${obs.badResponses.length}`,
    pass,
    after,
    notes: !httpOk ? `${path} returned ${status}${resp?._error ? ' — ' + resp._error : ''}` :
           !noBad ? `Bad subresources: ${obs.badResponses.slice(0, 5).join(' | ')}` :
           !noConsole ? `Console errors: ${obs.consoleErrors.slice(0, 3).map((e) => e.slice(0, 200)).join(' | ')}` :
           !noPage ? `Page errors: ${obs.pageErrors.slice(0, 3).join(' | ')}` :
           !noNet ? `Network failures: ${obs.netFailures.slice(0, 3).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
