#!/usr/bin/env node
/**
 * 08-search.mjs — site-wide search overlay returns Pagefind results.
 *
 * Cell map:
 *   SEARCH-overlay-opens   Clicking the nav Search button opens the
 *                          overlay (`#search-overlay` loses .hidden).
 *   SEARCH-pagefind-loads  /pagefind/pagefind.js is reachable (200).
 *                          The overlay imports it dynamically on open;
 *                          if it 404s the search field silently never
 *                          returns results.
 *   SEARCH-returns-result  Typing a known-on-site query ("incivility")
 *                          produces at least one result element in the
 *                          results container within 4s.
 *
 * Requires the WRANGLER substrate (or any setup that serves the built
 * `dist/` with the pagefind index). Under plain `astro dev` there is no
 * /pagefind/ path; the cell auto-skips in that case.
 */
import { Audit, fetchStatus } from '../audit-lib.mjs';

const audit = new Audit({ name: 'search' });
await audit.setup();

if (audit.substrate === 'astro') {
  audit.log('SKIPPED — search overlay needs the built /pagefind/ index (use wrangler substrate).');
  audit.recordCell({
    id: 'SEARCH-skipped-astro',
    tableRef: 'search overlay under astro dev',
    expected: 'wrangler substrate (dist with pagefind index)',
    observed: 'astro dev substrate — pagefind not served',
    pass: null,
    notes: 'Re-run under `wrangler pages dev dist` to exercise search.',
  });
  await audit.teardown();
  process.exit(0);
}

// ─── SEARCH-pagefind-loads ────────────────────────────────────────
audit.log('SEARCH-pagefind-loads: /pagefind/pagefind.js reachable');
{
  const r = await fetchStatus(`${audit.baseUrl}/pagefind/pagefind.js`);
  audit.recordCell({
    id: 'SEARCH-pagefind-loads',
    tableRef: 'GET /pagefind/pagefind.js',
    expected: '200 (pagefind index built and served at /pagefind/)',
    observed: `status=${r.status}, ok=${r.ok}`,
    pass: !!r.ok,
    notes: !r.ok ? `Pagefind index missing — run \`npm run build\` so dist/pagefind/ exists, then re-serve.` : '',
  });
}

// ─── SEARCH-overlay-opens ─────────────────────────────────────────
audit.log('SEARCH-overlay-opens: clicking nav search reveals overlay');
{
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(400);
  const before = await audit.shot('SEARCH-overlay-before');

  // Overlay starts hidden.
  const hiddenBefore = await audit.page.locator('#search-overlay').evaluate((el) => el.classList.contains('hidden'));

  await audit.page.locator('#nav-search-btn').click();
  await audit.page.waitForTimeout(400);

  const hiddenAfter = await audit.page.locator('#search-overlay').evaluate((el) => el.classList.contains('hidden'));
  const inputFocused = await audit.page.evaluate(() => document.activeElement?.id === 'site-search-input');
  const after = await audit.shot('SEARCH-overlay-after');
  const obs = audit.observerSnapshot();

  audit.recordCell({
    id: 'SEARCH-overlay-opens',
    tableRef: 'click #nav-search-btn -> #search-overlay visible',
    expected: 'overlay starts hidden; after click loses .hidden and focuses input',
    observed: `hiddenBefore=${hiddenBefore}, hiddenAfter=${hiddenAfter}, inputFocused=${inputFocused}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length})`,
    pass: hiddenBefore === true && hiddenAfter === false && obs.pageErrors.length === 0,
    before, after,
    notes: hiddenBefore !== true ? 'Overlay was already visible before click — initial state regression.' :
           hiddenAfter !== false ? 'Click did not reveal overlay — handler may be broken.' :
           obs.pageErrors.length ? `Page errors: ${obs.pageErrors.slice(0, 2).join(' | ')}` : '',
  });
}

// ─── SEARCH-returns-result ────────────────────────────────────────
audit.log('SEARCH-returns-result: typing "incivility" yields at least one result');
{
  audit.observerMark();
  // The overlay is still open from the previous cell. Type the query.
  const input = audit.page.locator('#site-search-input');
  await input.fill('incivility');
  // Pagefind is debounced and async. Wait up to 4s for any result row
  // to appear inside #search-results (the exact markup is Pagefind's
  // own; we just check the container grows beyond the hint paragraph).
  const hasResults = await audit.page.waitForFunction(
    () => {
      const r = document.getElementById('search-results');
      if (!r) return false;
      // Hint paragraph is the only child when results are empty.
      // Any extra child element means Pagefind produced something.
      const children = r.querySelectorAll(':scope > *');
      if (children.length === 0) return false;
      if (children.length === 1 && children[0].id === 'search-hint') return false;
      return true;
    },
    null,
    { timeout: 4000 },
  ).then(() => true).catch(() => false);
  const after = await audit.shot('SEARCH-results');
  const obs = audit.observerSnapshot();

  audit.recordCell({
    id: 'SEARCH-returns-result',
    tableRef: 'type "incivility" -> #search-results populated',
    expected: 'within 4s, #search-results contains at least one element that is not the hint',
    observed: `hasResults=${hasResults}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length})`,
    pass: hasResults && obs.pageErrors.length === 0,
    after,
    notes: !hasResults ? 'Search returned no results within 4s — Pagefind import failed, or the index has no entries for "incivility".' :
           obs.pageErrors.length ? `Page errors: ${obs.pageErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
