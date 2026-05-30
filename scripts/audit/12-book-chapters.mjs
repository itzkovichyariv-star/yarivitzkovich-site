#!/usr/bin/env node
/**
 * 12-book-chapters.mjs — the book↔chapter grouping renders.
 *
 * Cell map:
 *   BOOK-lists-chapters   Opening "The Challenges of Academic Incivility" in
 *                         the publications drawer shows a "Chapters in this
 *                         book (7)" section. Guards the `partOf` data flow,
 *                         which is fragile: it must be carried through the
 *                         schema, the index.astro mapping, the Publication
 *                         type, AND the Drawer props — drop it anywhere and
 *                         the grouping silently disappears (it did once).
 *
 * The 7 chapters were moved out of _drafts/ and linked via
 * partOf: "challenges-academic-incivility".
 */
import { Audit } from '../audit-lib.mjs';

const BOOK_TITLE = 'The Challenges of Academic Incivility';
const EXPECTED_CHAPTERS = 7;

const audit = new Audit({ name: 'book-chapters' });
await audit.setup();

audit.log('BOOK-lists-chapters: open the book and assert it lists its chapters');
{
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/publications/`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(1200);
  const before = await audit.shot('BOOK-before');

  // Click the book by its title (first match).
  const bookEl = audit.page.getByText(BOOK_TITLE, { exact: false }).first();
  const found = await bookEl.count();
  if (found) await bookEl.click().catch(() => {});
  await audit.page.waitForTimeout(1000);
  const after = await audit.shot('BOOK-drawer');
  const obs = audit.observerSnapshot();

  const body = await audit.page.locator('body').innerText().catch(() => '');
  const m = body.match(/Chapters in this book \((\d+)\)/i);
  const count = m ? Number(m[1]) : 0;
  const headingShown = /Chapters in this book/i.test(body);

  audit.recordCell({
    id: 'BOOK-lists-chapters',
    tableRef: 'publications drawer / book lists its chapters',
    expected: `opening "${BOOK_TITLE}" shows "Chapters in this book (${EXPECTED_CHAPTERS})"; no console/page errors`,
    observed: `bookFound=${found > 0}, headingShown=${headingShown}, count=${count}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length})`,
    pass: found > 0 && headingShown && count === EXPECTED_CHAPTERS && obs.pageErrors.length === 0,
    before, after,
    notes: found === 0 ? `Couldn't find the book "${BOOK_TITLE}" on /publications.` :
           !headingShown ? 'No "Chapters in this book" section — partOf likely dropped from the data flow (schema → index.astro mapping → Publication type → Drawer props).' :
           count !== EXPECTED_CHAPTERS ? `Expected ${EXPECTED_CHAPTERS} chapters, drawer shows ${count}.` :
           obs.pageErrors.length ? `Page errors: ${obs.pageErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
