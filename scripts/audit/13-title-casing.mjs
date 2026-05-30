#!/usr/bin/env node
/**
 * 13-title-casing.mjs — publication titles render in APA 7 sentence case.
 *
 * Guards the 2026-05 normalization: ~27 titles were converted from Title Case
 * to sentence case (capitalize first word + first word after a colon + proper
 * nouns only). A regression would most likely come from re-running
 * scripts/generate-publications.mjs (which still holds stale Title-Case strings
 * in its PUBS array) — KEEP is supposed to make those inert. This cell catches
 * it if that protection ever breaks.
 *
 * Strategy: load a couple of detail pages (deterministic — each always renders
 * its own title) and assert the sentence-case form is present and the old
 * Title-Case form is absent.
 */
import { Audit } from '../audit-lib.mjs';

const CASES = [
  {
    slug: 'emotional-intelligence-as-a-remedy-for-academic-incivility',
    good: 'Emotional intelligence as a remedy for academic incivility',
    bad: 'Emotional Intelligence as a Remedy for Academic Incivility',
  },
  {
    slug: 'learning-environments-as-precursors-of-academic-incivility',
    good: 'Learning environments as precursors of academic incivility',
    bad: 'Learning Environments as Precursors of Academic Incivility',
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

  const body = await audit.page.locator('body').innerText().catch(() => '');
  const hasGood = body.includes(c.good);
  const hasBad = body.includes(c.bad);

  audit.recordCell({
    id: `TITLE-sentence-case:${c.slug}`,
    tableRef: `/publications/${c.slug} title casing`,
    expected: `body contains sentence-case "${c.good}" and NOT Title-Case "${c.bad}"; no page errors`,
    observed: `hasGood=${hasGood}, hasBad=${hasBad}, pageErrors=${obs.pageErrors.length}`,
    pass: hasGood && !hasBad && obs.pageErrors.length === 0,
    after,
    notes: !hasGood ? `Sentence-case title missing — title field may have reverted to Title Case (check generate-publications.mjs KEEP).` :
           hasBad ? `Old Title-Case title is present — normalization reverted.` :
           obs.pageErrors.length ? `Page errors: ${obs.pageErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
