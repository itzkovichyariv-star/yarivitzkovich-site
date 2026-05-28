#!/usr/bin/env node
/**
 * 07-topics.mjs — topics index + sentinel topic detail page.
 *
 * Cell map:
 *   TOPIC-index           /topics returns 200, no errors, lists at
 *                         least one topic from the canonical list.
 *   TOPIC-detail-loads    /topics/incivility (sentinel) returns 200
 *                         with no console/page/network errors.
 *   TOPIC-detail-content  The detail page renders the topic label
 *                         "Incivility" and at least one publication
 *                         tagged with this topic.
 *
 * Sentinel topic: `incivility` — the most-papered topic on the site
 * (canonical workplace-mistreatment thread). Stable identifier in
 * `src/data/topics.ts`.
 */
import { Audit } from '../audit-lib.mjs';

const SENTINEL_TOPIC = 'incivility';
const EXPECTED_LABEL = 'Incivility';

const audit = new Audit({ name: 'topics' });
await audit.setup();

// ─── TOPIC-index ───────────────────────────────────────────────────
audit.log('TOPIC-index: /topics loads, lists Incivility');
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/topics`, { waitUntil: 'networkidle', timeout: 15000 })
    .catch((e) => ({ _error: e.message }));
  if (resp && !resp._error) await audit.page.waitForTimeout(600);
  const after = await audit.shot('TOPIC-index');
  const obs = audit.observerSnapshot();

  const httpOk = resp && !resp._error && resp.ok && resp.ok();
  const status = resp && !resp._error ? resp.status() : 'navigation-failed';
  const bodyText = await audit.page.locator('body').innerText().catch(() => '');
  const listsSentinel = bodyText.includes(EXPECTED_LABEL);
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0 && obs.netFailures.length === 0 && obs.badResponses.length === 0;

  audit.recordCell({
    id: 'TOPIC-index',
    tableRef: 'GET /topics',
    expected: `200; body lists "${EXPECTED_LABEL}"; no errors`,
    observed: `status=${status}, listsSentinel=${listsSentinel}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length}/n${obs.netFailures.length}/b${obs.badResponses.length})`,
    pass: !!httpOk && listsSentinel && noErrors,
    after,
    notes: !httpOk ? `Returned ${status}${resp?._error ? ' — ' + resp._error : ''}` :
           !listsSentinel ? `Body missing "${EXPECTED_LABEL}" — topics list may be empty or sentinel removed from data/topics.ts.` :
           !noErrors ? `Errors: ${[...obs.consoleErrors, ...obs.badResponses].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── TOPIC-detail-loads ───────────────────────────────────────────
audit.log(`TOPIC-detail-loads: /topics/${SENTINEL_TOPIC} loads cleanly`);
{
  audit.observerMark();
  const resp = await audit.page.goto(`${audit.baseUrl}/topics/${SENTINEL_TOPIC}`, { waitUntil: 'networkidle', timeout: 15000 })
    .catch((e) => ({ _error: e.message }));
  if (resp && !resp._error) await audit.page.waitForTimeout(600);
  const after = await audit.shot('TOPIC-detail-loads');
  const obs = audit.observerSnapshot();

  const httpOk = resp && !resp._error && resp.ok && resp.ok();
  const status = resp && !resp._error ? resp.status() : 'navigation-failed';
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0 && obs.netFailures.length === 0 && obs.badResponses.length === 0;

  audit.recordCell({
    id: 'TOPIC-detail-loads',
    tableRef: `GET /topics/${SENTINEL_TOPIC}`,
    expected: '200; no console/page/network errors; no 4xx/5xx subresources',
    observed: `status=${status}, errors=(c${obs.consoleErrors.length}/p${obs.pageErrors.length}/n${obs.netFailures.length}/b${obs.badResponses.length})`,
    pass: !!httpOk && noErrors,
    after,
    notes: !httpOk ? `Returned ${status}${resp?._error ? ' — ' + resp._error : ''}` :
           !noErrors ? `Errors: ${[...obs.consoleErrors, ...obs.badResponses].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── TOPIC-detail-content ─────────────────────────────────────────
audit.log('TOPIC-detail-content: renders topic label + at least one publication entry');
{
  const bodyText = await audit.page.locator('body').innerText().catch(() => '');
  const hasLabel = bodyText.includes(EXPECTED_LABEL);
  // Topic landing pages list publications tagged with this topic. We
  // assert at least one Itzkovich publication appears — guards against
  // a regression that breaks the tag filter and shows zero papers.
  const hasOwnerName = bodyText.includes('Itzkovich');
  const after = await audit.shot('TOPIC-detail-content');

  audit.recordCell({
    id: 'TOPIC-detail-content',
    tableRef: `/topics/${SENTINEL_TOPIC} content rendered`,
    expected: `body contains "${EXPECTED_LABEL}" and at least one paper byline`,
    observed: `hasLabel=${hasLabel}, hasOwnerByline=${hasOwnerName}, bodyLen=${bodyText.length}`,
    pass: hasLabel && hasOwnerName,
    after,
    notes: !hasLabel ? `Body missing "${EXPECTED_LABEL}" — wrong page or label not rendered.` :
           !hasOwnerName ? 'No Itzkovich byline — topic filter may be returning empty list.' : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
