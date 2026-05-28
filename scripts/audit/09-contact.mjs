#!/usr/bin/env node
/**
 * 09-contact.mjs — homepage Contact / Footer section is reachable and
 * exposes the documented channels.
 *
 * Cell map:
 *   CONTACT-anchor-resolves   The nav "#contact" link scrolls to a
 *                             real anchor — i.e. an element with
 *                             id="contact" exists on the page. Catches
 *                             "broken anchor" regressions where the
 *                             footer id is renamed.
 *   CONTACT-channels-present  Within the #contact element, an email
 *                             mailto link AND a WhatsApp link AND an
 *                             ORCID profile link are all present.
 */
import { Audit } from '../audit-lib.mjs';

const audit = new Audit({ name: 'contact' });
await audit.setup();

audit.log('CONTACT-anchor-resolves + CONTACT-channels-present: load / and inspect #contact');
audit.observerMark();
await audit.page.goto(`${audit.baseUrl}/#contact`, { waitUntil: 'networkidle' });
await audit.page.waitForTimeout(600);
const after = await audit.shot('CONTACT-section');
const obs = audit.observerSnapshot();

// ─── CONTACT-anchor-resolves ───────────────────────────────────────
{
  const anchorExists = await audit.page.locator('#contact').count();
  audit.recordCell({
    id: 'CONTACT-anchor-resolves',
    tableRef: '#contact anchor present on /',
    expected: 'an element with id="contact" exists on the homepage',
    observed: `count(#contact)=${anchorExists}`,
    pass: anchorExists > 0,
    after,
    notes: anchorExists === 0 ? 'No #contact anchor on / — nav "#contact" link is broken.' : '',
  });
}

// ─── CONTACT-channels-present ─────────────────────────────────────
{
  const emailHref = await audit.page.locator('#contact a[href^="mailto:"]').first().getAttribute('href').catch(() => null);
  const waHref = await audit.page.locator('#contact a[href*="wa.me"]').first().getAttribute('href').catch(() => null);
  const orcidHref = await audit.page.locator('#contact a[href*="orcid.org"]').first().getAttribute('href').catch(() => null);

  const hasEmail = !!emailHref && emailHref.startsWith('mailto:');
  const hasWhatsApp = !!waHref && waHref.includes('wa.me');
  const hasOrcid = !!orcidHref && orcidHref.includes('orcid.org');
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0;

  audit.recordCell({
    id: 'CONTACT-channels-present',
    tableRef: '#contact has email + WhatsApp + ORCID links',
    expected: 'mailto: link AND wa.me link AND orcid.org link inside #contact; no console/page errors',
    observed: `email=${hasEmail}, whatsapp=${hasWhatsApp}, orcid=${hasOrcid}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length})`,
    pass: hasEmail && hasWhatsApp && hasOrcid && noErrors,
    after,
    notes: !hasEmail ? 'No mailto link inside #contact — email channel missing.' :
           !hasWhatsApp ? 'No wa.me link inside #contact — WhatsApp channel missing.' :
           !hasOrcid ? 'No orcid.org link inside #contact — ORCID profile missing.' :
           !noErrors ? `Errors loading /#contact: ${obs.consoleErrors.slice(0, 2).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
