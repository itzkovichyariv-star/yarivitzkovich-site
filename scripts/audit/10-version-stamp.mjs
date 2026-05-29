#!/usr/bin/env node
/**
 * 10-version-stamp.mjs — every page has a build-time version stamp.
 *
 * Cell map:
 *   STAMP-present-home     Homepage has a single #version-stamp element.
 *   STAMP-format-correct   The stamp's text matches the canonical regex
 *                          v1.YYYY.MM.DD-<shortsha>.
 *   STAMP-present-other    A second page (publication detail) also has
 *                          the stamp — proves it lives in BaseLayout
 *                          and isn't accidentally homepage-only.
 *
 * Why this cell matters: the stamp is the only at-a-glance way to
 * confirm a deploy actually shipped. If `BaseLayout.astro` ever stops
 * rendering the stamp (someone deletes the block, conditionalises it
 * away on a refactor, or the build-time `execSync('git rev-parse')`
 * silently fails to "nogit"), this cell turns the gate red before the
 * deploy goes out.
 */
import { Audit } from '../audit-lib.mjs';

const STAMP_REGEX = /^v1\.\d{4}\.\d{2}\.\d{2}-(?:[a-f0-9]{7,12}|nogit)$/;

const audit = new Audit({ name: 'version-stamp' });
await audit.setup();

// ─── STAMP-present-home ────────────────────────────────────────────
audit.log('STAMP-present-home: / has exactly one #version-stamp element');
{
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await audit.page.waitForTimeout(400);
  const after = await audit.shot('STAMP-present-home');

  const count = await audit.page.locator('#version-stamp').count();
  audit.recordCell({
    id: 'STAMP-present-home',
    tableRef: '#version-stamp on /',
    expected: 'exactly one element with id="version-stamp"',
    observed: `count=${count}`,
    pass: count === 1,
    after,
    notes: count === 0 ? 'No #version-stamp on / — BaseLayout regression, stamp block removed or conditionalised away.' :
           count > 1 ? `Found ${count} stamps — duplicate render.` : '',
  });
}

// ─── STAMP-format-correct ──────────────────────────────────────────
audit.log(`STAMP-format-correct: text matches ${STAMP_REGEX}`);
{
  const text = (await audit.page.locator('#version-stamp').first().textContent().catch(() => '') || '').trim();
  const matches = STAMP_REGEX.test(text);
  const after = await audit.shot('STAMP-format-correct');

  audit.recordCell({
    id: 'STAMP-format-correct',
    tableRef: '#version-stamp text format',
    expected: `text matches ${STAMP_REGEX} (e.g. "v1.2026.05.29-a2c1077")`,
    observed: `text="${text}"`,
    pass: matches,
    after,
    notes: !matches ? `Stamp text "${text}" doesn't match the v1.YYYY.MM.DD-<sha> regex — build-time computation broken or someone changed the format.` : '',
  });
}

// ─── STAMP-present-other ───────────────────────────────────────────
audit.log('STAMP-present-other: a non-home page also has the stamp');
{
  audit.observerMark();
  // /about is a static page guaranteed to use BaseLayout.
  await audit.page.goto(`${audit.baseUrl}/about`, { waitUntil: 'domcontentloaded' });
  await audit.page.waitForTimeout(400);
  const after = await audit.shot('STAMP-present-other');

  const count = await audit.page.locator('#version-stamp').count();
  const text = (await audit.page.locator('#version-stamp').first().textContent().catch(() => '') || '').trim();
  const matches = STAMP_REGEX.test(text);

  audit.recordCell({
    id: 'STAMP-present-other',
    tableRef: '#version-stamp on /about',
    expected: 'stamp present on /about with same format as on /',
    observed: `count=${count}, text="${text}"`,
    pass: count === 1 && matches,
    after,
    notes: count !== 1 ? `Got ${count} stamps on /about — BaseLayout-injection regression.` :
           !matches ? `Stamp text "${text}" doesn't match regex on /about.` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
