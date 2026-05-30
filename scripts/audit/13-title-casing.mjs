#!/usr/bin/env node
/**
 * 13-title-casing.mjs — publication titles render in APA 7 sentence case,
 * everywhere on the detail page (visible title AND the hidden BibTeX export).
 *
 * Guards the 2026-05 normalization: ~27 titles + their stored BibTeX blocks
 * were converted from Title Case to sentence case. Two regression sources:
 *   1. re-running generate-publications.mjs (stale Title-Case PUBS array) —
 *      KEEP is supposed to make that inert.
 *   2. a hand-edited bibtex `title = {...}` drifting back to Title Case.
 *
 * Strategy: load a few detail pages (deterministic) and assert the sentence-
 * case form is the VISIBLE title, and the old Title-Case form appears NOWHERE
 * in the page HTML (innerText would miss a collapsed "copy BibTeX" block, so we
 * scan page.content()). Includes slugs that carried a stored BibTeX title.
 */
import { Audit } from '../audit-lib.mjs';

const CASES = [
  {
    slug: 'emotional-intelligence-as-a-remedy-for-academic-incivility',
    good: 'Emotional intelligence as a remedy for academic incivility',
    bad: 'Emotional Intelligence as a Remedy for Academic Incivility',
  },
  {
    // had a stored BibTeX title in Title Case — guards the bibtex sync
    slug: 'ultimate-bystander-ai-incivility',
    good: 'The ultimate bystander: A theoretical framework for trust-based AI intervention in workplace incivility',
    bad: 'The Ultimate Bystander: A Theoretical Framework for Trust-Based AI Intervention in Workplace Incivility',
  },
  {
    // had a stored BibTeX title in Title Case
    slug: 'bullying-harassment-higher-ed-scoping',
    good: 'Workplace bullying and harassment in higher education institutions: A scoping review',
    bad: 'Workplace Bullying and Harassment in Higher Education Institutions: A Scoping Review',
  },
];

const audit = new Audit({ name: 'title-casing' });
await audit.setup();

for (const c of CASES) {
  audit.log(`TITLE-sentence-case: /publications/${c.slug}`);
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/publications/${c.slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch(() => {});
  await audit.page.waitForTimeout(700);
  const after = await audit.shot(`TITLE-${c.slug}`);
  const obs = audit.observerSnapshot();

  const innerText = await audit.page.locator('body').innerText().catch(() => '');
  const html = await audit.page.content().catch(() => '');
  const goodVisible = innerText.includes(c.good); // visible sentence-case title
  const badAnywhere = html.includes(c.bad);       // Title-Case nowhere (incl. bibtex)

  audit.recordCell({
    id: `TITLE-sentence-case:${c.slug}`,
    tableRef: `/publications/${c.slug} title casing (visible + bibtex)`,
    expected: `visible title is sentence-case "${c.good.slice(0, 40)}…"; Title-Case form absent from page HTML; no page errors`,
    observed: `goodVisible=${goodVisible}, badAnywhere=${badAnywhere}, pageErrors=${obs.pageErrors.length}`,
    pass: goodVisible && !badAnywhere && obs.pageErrors.length === 0,
    after,
    notes: !goodVisible ? `Sentence-case title not visible — title may have reverted (check generate-publications.mjs KEEP).` :
           badAnywhere ? `Title-Case form present in HTML — likely a stale bibtex title (run scripts/sync-bibtex-titles.mjs).` :
           obs.pageErrors.length ? `Page errors: ${obs.pageErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
