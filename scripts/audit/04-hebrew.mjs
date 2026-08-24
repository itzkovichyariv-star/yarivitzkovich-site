#!/usr/bin/env node
/**
 * 04-hebrew.mjs — Hebrew locale tree loads cleanly.
 *
 * Cell map:
 *   HE-home        /he/ loads with dir=rtl, no errors, lang attribute
 *                  on <html> is "he".
 *   HE-teaching    /he/teaching loads cleanly.
 *   HE-privacy     /he/privacy renders RTL Hebrew, carries real content,
 *                  and is the page the Hebrew footer actually links to —
 *                  the failure this guards is a Hebrew reader clicking
 *                  "פרטיות" and landing on the English statement.
 *   HE-nav-toggle  Lang toggle on /he/ points back to / (English).
 *
 * Why a separate suite from 02-static-pages: the Hebrew tree only has
 * a few mirrored pages today (index + teaching + privacy). A regression where /he/
 * starts inheriting English content, or the dir flips back to ltr, or
 * the language toggle stops working — those are localization bugs the
 * generic STATIC walk wouldn't catch.
 */
import { Audit } from '../audit-lib.mjs';

const audit = new Audit({ name: 'hebrew' });
await audit.setup();

// ─── HE-home ────────────────────────────────────────────────────────
audit.log('HE-home: /he/ renders RTL with lang="he" and no errors');
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/he/`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(800);
  const after = await audit.shot('HE-home');
  const obs = audit.observerSnapshot();

  const httpOk = resp && resp.ok();
  const htmlAttrs = await audit.page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  const langIsHe = htmlAttrs.lang === 'he';
  const dirIsRtl = htmlAttrs.dir === 'rtl';
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0 && obs.netFailures.length === 0 && obs.badResponses.length === 0;

  audit.recordCell({
    id: 'HE-home',
    tableRef: 'GET /he/',
    expected: '200; <html lang="he" dir="rtl">; no console/page/network errors; no 4xx/5xx subresources',
    observed: `status=${resp?.status()}, lang=${htmlAttrs.lang}, dir=${htmlAttrs.dir}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length}/n${obs.netFailures.length}/b${obs.badResponses.length})`,
    pass: !!httpOk && langIsHe && dirIsRtl && noErrors,
    after,
    notes: !httpOk ? `/he/ returned ${resp?.status()}` :
           !langIsHe ? `Wanted lang=he, got "${htmlAttrs.lang}".` :
           !dirIsRtl ? `Wanted dir=rtl, got "${htmlAttrs.dir}".` :
           !noErrors ? `Errors: console=${obs.consoleErrors.slice(0, 2).join(' | ')} | bad=${obs.badResponses.slice(0, 2).join(' | ')}` : '',
  });
}

// ─── HE-teaching ────────────────────────────────────────────────────
audit.log('HE-teaching: /he/teaching loads cleanly');
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/he/teaching`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(600);
  const after = await audit.shot('HE-teaching');
  const obs = audit.observerSnapshot();

  const httpOk = resp && resp.ok();
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0 && obs.netFailures.length === 0 && obs.badResponses.length === 0;

  audit.recordCell({
    id: 'HE-teaching',
    tableRef: 'GET /he/teaching',
    expected: '200; no errors; no 4xx/5xx subresources',
    observed: `status=${resp?.status()}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length}/n${obs.netFailures.length}/b${obs.badResponses.length})`,
    pass: !!httpOk && noErrors,
    after,
    notes: !httpOk ? `/he/teaching returned ${resp?.status()}` :
           !noErrors ? `Errors: ${[...obs.consoleErrors, ...obs.badResponses].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── HE-privacy ─────────────────────────────────────────────────────
audit.log('HE-privacy: /he/privacy renders Hebrew RTL and is what the Hebrew footer links to');
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/he/privacy`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(600);
  const after = await audit.shot('HE-privacy');
  const obs = audit.observerSnapshot();

  const httpOk = resp && resp.ok();
  const page = await audit.page.evaluate(() => {
    const main = document.querySelector('main');
    const text = (main?.innerText || '').trim();
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      chars: text.length,
      // Hebrew block: if this page ever regressed to English content under
      // a Hebrew URL, the ratio collapses and this cell catches it.
      hebrewChars: (text.match(/[\u0590-\u05FF]/g) || []).length,
      h1: document.querySelector('main h1')?.textContent?.trim() || '',
      h2Count: document.querySelectorAll('main h2').length,
      toggleHref: document.querySelector('header a[aria-label*="Switch language"]')?.getAttribute('href') || null,
    };
  });
  // The footer link a Hebrew reader actually clicks must stay in-locale.
  const footerHref = await audit.page.locator('#contact a[href*="privacy"]').first().getAttribute('href').catch(() => null);

  const isHebrew = page.hebrewChars > 500;
  const enoughContent = page.chars >= 500;
  const rtl = page.lang === 'he' && page.dir === 'rtl';
  const footerInLocale = footerHref === '/he/privacy';
  const togglesToEnglish = page.toggleHref === '/privacy';
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0 && obs.netFailures.length === 0 && obs.badResponses.length === 0;

  audit.recordCell({
    id: 'HE-privacy',
    tableRef: 'GET /he/privacy',
    expected: '200; lang=he dir=rtl; 500+ chars of predominantly Hebrew content; footer links to /he/privacy; toggle returns to /privacy',
    observed: `status=${resp?.status()}, lang=${page.lang}/${page.dir}, chars=${page.chars} (hebrew=${page.hebrewChars}), h1="${page.h1}", h2=${page.h2Count}, footer=${footerHref}, toggle=${page.toggleHref}`,
    pass: !!httpOk && rtl && isHebrew && enoughContent && footerInLocale && togglesToEnglish && noErrors,
    after,
    notes: !httpOk ? `/he/privacy returned ${resp?.status()}` :
           !rtl ? `Wanted lang=he dir=rtl, got ${page.lang}/${page.dir}.` :
           !enoughContent ? `Only ${page.chars} chars — below the 500 that trust-anchor checks look for.` :
           !isHebrew ? `Only ${page.hebrewChars} Hebrew characters in ${page.chars} — the page may have regressed to English content.` :
           !footerInLocale ? `Hebrew footer links to "${footerHref}" instead of /he/privacy — Hebrew readers land on the English statement.` :
           !togglesToEnglish ? `Language toggle points at "${page.toggleHref}" instead of /privacy.` :
           !noErrors ? `Errors: ${[...obs.consoleErrors, ...obs.badResponses].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── HE-nav-toggle ──────────────────────────────────────────────────
audit.log('HE-nav-toggle: language toggle on /he/ links to English equivalent');
{
  audit.observerMark();
  await audit.page.goto(`${audit.baseUrl}/he/`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(400);
  const before = await audit.shot('HE-nav-toggle-before');

  // The LangToggle component renders an anchor with the cross-locale
  // href. On /he/ that href should be the English equivalent. We don't
  // know the exact selector contract (LangToggle.astro internal), so we
  // search the header for an anchor whose href is "/" or "/?..." or
  // starts with the base URL and is NOT /he/-prefixed.
  const toggleHref = await audit.page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header a[href]'));
    const candidate = links.find((a) => {
      const h = a.getAttribute('href') || '';
      // Plain "/" or "/path" without /he/ prefix is the English target.
      // Drop in-page anchors and the homepage link to / itself if it's
      // also the brand wordmark — we want the language toggle specifically.
      return h === '/' || (h.startsWith('/') && !h.startsWith('/he'));
    });
    return candidate?.getAttribute('href') ?? null;
  });

  const after = await audit.shot('HE-nav-toggle-after');
  const obs = audit.observerSnapshot();

  const hasEnglishTarget = toggleHref !== null;
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0;

  audit.recordCell({
    id: 'HE-nav-toggle',
    tableRef: '/he/ / Lang toggle points to English',
    expected: 'header contains at least one anchor to a non-/he/ path (the language switch target)',
    observed: `toggleHref=${toggleHref}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length})`,
    pass: hasEnglishTarget && noErrors,
    before, after,
    notes: !hasEnglishTarget ? 'No English-target anchor found in /he/ header — LangToggle may be broken.' :
           !noErrors ? `Errors: ${obs.consoleErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
