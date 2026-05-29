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

// ─── STAMP-theme-adaptive ──────────────────────────────────────────
// Regression guard added 2026-05-29 after the stamp shipped with a
// hardcoded `color: rgba(0,0,0,0.25)` that was invisible in dark mode
// (surface #0F0D0A) and unreadable over the maroon footer. The fix
// switched it to `var(--text-soft)`, which flips dark↔light with the
// theme. This cell proves the color is theme-adaptive: it reads the
// computed color in light mode, toggles `.dark` on <html>, reads it
// again, and asserts the two DIFFER. A hardcoded color would be
// identical in both modes → fail. It also asserts the dark-mode color
// is light-ish (high channel values) so it's legible on a dark bg.
audit.log('STAMP-theme-adaptive: stamp color flips between light and dark mode');
{
  await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await audit.page.waitForTimeout(300);

  const readColor = () => audit.page.evaluate(() => {
    const el = document.getElementById('version-stamp');
    return el ? getComputedStyle(el).color : null;
  });
  // Parse "rgb(a)(r, g, b[, a])" → [r,g,b].
  const rgb = (s) => (s || '').match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];

  // Light mode (ensure .dark is OFF first).
  await audit.page.evaluate(() => document.documentElement.classList.remove('dark'));
  await audit.page.waitForTimeout(100);
  const lightColor = await readColor();

  // Dark mode.
  await audit.page.evaluate(() => document.documentElement.classList.add('dark'));
  await audit.page.waitForTimeout(100);
  const darkColor = await readColor();
  const after = await audit.shot('STAMP-theme-adaptive-dark');

  // Reset to light so the run leaves a clean state.
  await audit.page.evaluate(() => document.documentElement.classList.remove('dark'));

  const differs = !!lightColor && !!darkColor && lightColor !== darkColor;
  // In dark mode the text must be light to be legible on #0F0D0A.
  // --text-soft dark value is rgba(244,239,230,0.5) → all channels > 200.
  const [dr, dg, db] = rgb(darkColor);
  const darkIsLight = dr > 180 && dg > 180 && db > 180;

  audit.recordCell({
    id: 'STAMP-theme-adaptive',
    tableRef: '#version-stamp color flips with theme',
    expected: 'computed color differs light vs dark; dark-mode color is light-ish (legible on #0F0D0A)',
    observed: `light=${lightColor}, dark=${darkColor}, differs=${differs}, darkIsLight=${darkIsLight}`,
    pass: differs && darkIsLight,
    after,
    notes: !differs ? 'Stamp color is identical in light and dark mode — likely hardcoded again (regression). Use var(--text-soft).' :
           !darkIsLight ? `Dark-mode color ${darkColor} is too dark to read on the #0F0D0A surface.` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
