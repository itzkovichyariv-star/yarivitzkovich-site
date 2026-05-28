#!/usr/bin/env node
/**
 * 06-publication-detail.mjs — single-paper detail pages render correctly.
 *
 * Cell map:
 *   PUB-detail-loads     /publications/<slug> returns 200 with no
 *                        console/page/network errors and no bad
 *                        subresources.
 *   PUB-detail-content   The detail page renders the paper's title and
 *                        at least one author name from the MDX file.
 *                        Catches "page loads but shows wrong content"
 *                        bugs (e.g., a routing regression that surfs the
 *                        wrong entry).
 *
 * Sentinel slug: `incivility-inhibit-intrapreneurship` — chosen because
 * (a) it's the one whose id we renamed in v0.1 to fix the duplicate-key
 * bug, so we want this URL specifically to stay healthy, and (b) it's a
 * stable MDX entry unlikely to be deleted.
 */
import { Audit } from '../audit-lib.mjs';

const SENTINEL_SLUG = 'incivility-inhibit-intrapreneurship';
const EXPECTED_TITLE_SUBSTR = 'incivility'; // case-insensitive match
const EXPECTED_AUTHOR_SUBSTR = 'Itzkovich';

const audit = new Audit({ name: 'publication-detail' });
await audit.setup();

// ─── PUB-detail-loads ──────────────────────────────────────────────
audit.log(`PUB-detail-loads: /publications/${SENTINEL_SLUG} loads cleanly`);
{
  audit.observerMark();
  // domcontentloaded (not networkidle) — the page fires a
  // /api/citations fetch that legitimately 404s when the paper has
  // no cached citation data, and networkidle waits forever for the
  // follow-up retries. We just need the page rendered.
  const resp = await audit.page.goto(`${audit.baseUrl}/publications/${SENTINEL_SLUG}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch((e) => ({ _error: e.message }));
  if (resp && !resp._error) {
    // Give React a beat to hydrate + the title/authors to render.
    await audit.page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
    await audit.page.waitForTimeout(800);
  }
  const after = await audit.shot('PUB-detail-loads');
  const obs = audit.observerSnapshot();

  const httpOk = resp && !resp._error && resp.ok && resp.ok();
  const status = resp && !resp._error ? resp.status() : 'navigation-failed';
  const noConsole = obs.consoleErrors.length === 0;
  const noPage = obs.pageErrors.length === 0;
  const noNet = obs.netFailures.length === 0;
  const noBad = obs.badResponses.length === 0;

  audit.recordCell({
    id: 'PUB-detail-loads',
    tableRef: `GET /publications/${SENTINEL_SLUG}`,
    expected: '200; no console/page/network errors; no 4xx/5xx subresources',
    observed: `status=${status}, console=${obs.consoleErrors.length}, page=${obs.pageErrors.length}, net=${obs.netFailures.length}, bad=${obs.badResponses.length}`,
    pass: !!httpOk && noConsole && noPage && noNet && noBad,
    after,
    notes: !httpOk ? `Returned ${status}${resp?._error ? ' — ' + resp._error : ''}` :
           !noBad ? `Bad subresources: ${obs.badResponses.slice(0, 5).join(' | ')}` :
           !noConsole ? `Console errors: ${obs.consoleErrors.slice(0, 3).map((e) => e.slice(0, 200)).join(' | ')}` :
           !noPage ? `Page errors: ${obs.pageErrors.slice(0, 3).join(' | ')}` :
           !noNet ? `Network failures: ${obs.netFailures.slice(0, 3).join(' | ')}` : '',
  });
}

// ─── PUB-detail-content ───────────────────────────────────────────
// Already on the page from the previous cell. Read the rendered body
// and assert the sentinel paper's title and an author name are present.
audit.log('PUB-detail-content: title + author render from MDX frontmatter');
{
  const bodyText = await audit.page.locator('body').innerText().catch(() => '');
  const titleMatches = new RegExp(EXPECTED_TITLE_SUBSTR, 'i').test(bodyText);
  const authorMatches = bodyText.includes(EXPECTED_AUTHOR_SUBSTR);
  const after = await audit.shot('PUB-detail-content');

  audit.recordCell({
    id: 'PUB-detail-content',
    tableRef: `/publications/${SENTINEL_SLUG} content rendered`,
    expected: `body contains "${EXPECTED_TITLE_SUBSTR}" (case-insensitive) AND "${EXPECTED_AUTHOR_SUBSTR}"`,
    observed: `titleMatches=${titleMatches}, authorMatches=${authorMatches}, bodyLen=${bodyText.length}`,
    pass: titleMatches && authorMatches,
    after,
    notes: !titleMatches ? `Body missing "${EXPECTED_TITLE_SUBSTR}" — wrong page rendered or title field empty.` :
           !authorMatches ? `Body missing "${EXPECTED_AUTHOR_SUBSTR}" — authors not rendering.` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
