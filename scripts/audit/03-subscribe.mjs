#!/usr/bin/env node
/**
 * 03-subscribe.mjs — subscribe form behavior, no real side effects.
 *
 * Cell map:
 *   SUB-empty-blocked    Submitting the form with an empty email shows
 *                        the client-side "Please enter an email address."
 *                        message AND never fires a POST to /api/subscribe.
 *   SUB-valid-success    With a valid email + mocked 200 pending response,
 *                        the success copy renders ("Check your inbox…").
 *   SUB-server-error     With a mocked 500 response, the user-visible
 *                        error copy renders ("Something went wrong…").
 *
 * The /api/subscribe POST is a Cloudflare Pages Function that writes to
 * D1 and sends a real confirmation email. We intercept it with
 * Playwright's page.route() so the audit never touches production state.
 */
import { Audit } from '../audit-lib.mjs';

const audit = new Audit({ name: 'subscribe' });
await audit.setup();

// Track every POST hitting /api/subscribe so we can assert side-effects
// (or lack of them) per cell.
let postsToApi = [];
await audit.ctx.route('**/api/subscribe', async (route, req) => {
  if (req.method() !== 'POST') return route.continue();
  postsToApi.push(req.postDataJSON?.() ?? {});
  // Default mock: success/pending. Cells override per case below by
  // calling ctx.route again with a more specific handler before submit.
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, status: 'pending_confirmation', email_send: 'ok' }),
  });
});

async function loadFresh() {
  postsToApi = [];
  await audit.page.goto(`${audit.baseUrl}/subscribe`, { waitUntil: 'networkidle' });
  await audit.page.waitForTimeout(400);
}

// ─── SUB-empty-blocked ─────────────────────────────────────────────
audit.log('SUB-empty-blocked: empty submit triggers client guard, no POST fired');
{
  await loadFresh();
  const before = await audit.shot('SUB-empty-before');
  audit.observerMark();
  // Submit by pressing the submit button without filling the email
  // input. (Email input has `type="email" required` so HTML5 native
  // validation may fire first — we accept either: client guard OR
  // browser-native popup, but in both cases no POST should reach the
  // network and the form should not advance to success state.)
  const submit = audit.page.locator('#subscribe-form button[type="submit"], #subscribe-form button').first();
  await submit.click();
  await audit.page.waitForTimeout(500);
  const after = await audit.shot('SUB-empty-after');
  const obs = audit.observerSnapshot();

  const msgText = await audit.page.locator('#subscribe-message').textContent().catch(() => '');
  const guardShown = /please enter|valid email/i.test(msgText || '');
  // Or the browser's HTML5 popup blocked it — in that case msg stays empty
  // but the form's checkValidity returns false.
  const formValid = await audit.page.evaluate(() =>
    document.getElementById('subscribe-form')?.checkValidity?.() ?? null,
  );
  const browserBlocked = formValid === false;
  const blocked = guardShown || browserBlocked;
  const noPost = postsToApi.length === 0;
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0;

  audit.recordCell({
    id: 'SUB-empty-blocked',
    tableRef: '/subscribe / Empty submit blocked',
    expected: 'guard message OR HTML5 invalid; zero POSTs to /api/subscribe; no console/page errors',
    observed: `guardShown=${guardShown}, formValid=${formValid}, posts=${postsToApi.length}, msg="${(msgText || '').slice(0, 80)}"`,
    pass: blocked && noPost && noErrors,
    before, after,
    notes: !blocked ? 'Form accepted empty submit — guard regression.' :
           !noPost ? `Got ${postsToApi.length} POST(s) despite block — guard fired but didn't preventDefault.` :
           !noErrors ? `Errors during empty submit: ${[...obs.consoleErrors, ...obs.pageErrors].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── SUB-valid-success ─────────────────────────────────────────────
audit.log('SUB-valid-success: valid email + mocked 200 shows success copy');
{
  await loadFresh();
  const before = await audit.shot('SUB-valid-before');
  audit.observerMark();
  await audit.page.locator('#subscribe-email').fill('audit-valid@audit.local');
  const submit = audit.page.locator('#subscribe-form button[type="submit"], #subscribe-form button').first();
  await submit.click();
  // Wait for the success state to render — the inline script sets
  // textContent on #subscribe-message after the fetch resolves.
  const successShown = await audit.page.waitForFunction(
    () => /check your inbox|already subscribed/i.test(
      document.getElementById('subscribe-message')?.textContent || '',
    ),
    null, { timeout: 5000 },
  ).then(() => true).catch(() => false);
  const after = await audit.shot('SUB-valid-after');
  const obs = audit.observerSnapshot();

  const msgText = await audit.page.locator('#subscribe-message').textContent().catch(() => '');
  const exactlyOnePost = postsToApi.length === 1;
  const correctEmail = postsToApi[0]?.email === 'audit-valid@audit.local';
  const noErrors = obs.consoleErrors.length === 0 && obs.pageErrors.length === 0;

  audit.recordCell({
    id: 'SUB-valid-success',
    tableRef: '/subscribe / Valid email -> success copy',
    expected: 'exactly 1 POST with the typed email; "check your inbox" copy renders; no errors',
    observed: `posts=${postsToApi.length}, payloadEmail=${postsToApi[0]?.email ?? 'none'}, successShown=${successShown}, msg="${(msgText || '').slice(0, 100)}"`,
    pass: successShown && exactlyOnePost && correctEmail && noErrors,
    before, after,
    notes: !exactlyOnePost ? `Wanted 1 POST, got ${postsToApi.length}.` :
           !correctEmail ? `POST email didn't match what was typed.` :
           !successShown ? 'Success copy never rendered — fetch handler likely fell into an error branch.' :
           !noErrors ? `Errors during valid submit: ${[...obs.consoleErrors, ...obs.pageErrors].slice(0, 3).join(' | ')}` : '',
  });
}

// ─── SUB-server-error ──────────────────────────────────────────────
audit.log('SUB-server-error: mocked 500 shows generic error copy');
{
  // Override the default mock for this cell only — return 500.
  await audit.ctx.unroute('**/api/subscribe');
  let postsThisCell = [];
  await audit.ctx.route('**/api/subscribe', async (route, req) => {
    if (req.method() !== 'POST') return route.continue();
    postsThisCell.push(req.postDataJSON?.() ?? {});
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });

  await loadFresh();
  const before = await audit.shot('SUB-error-before');
  audit.observerMark();
  await audit.page.locator('#subscribe-email').fill('audit-error@audit.local');
  const submit = audit.page.locator('#subscribe-form button[type="submit"], #subscribe-form button').first();
  await submit.click();
  const errorShown = await audit.page.waitForFunction(
    () => /something went wrong|please try again/i.test(
      document.getElementById('subscribe-message')?.textContent || '',
    ),
    null, { timeout: 5000 },
  ).then(() => true).catch(() => false);
  const after = await audit.shot('SUB-error-after');
  const obs = audit.observerSnapshot();

  const msgText = await audit.page.locator('#subscribe-message').textContent().catch(() => '');
  const exactlyOnePost = postsThisCell.length === 1;
  // pageerrors not allowed; console errors tolerated here because the
  // fetch genuinely returned 500 and the inline handler intentionally
  // surfaces that to the user.
  const noPageErrors = obs.pageErrors.length === 0;

  audit.recordCell({
    id: 'SUB-server-error',
    tableRef: '/subscribe / 500 from /api/subscribe -> error copy',
    expected: 'exactly 1 POST; "something went wrong" copy renders; no uncaught page errors',
    observed: `posts=${postsThisCell.length}, errorShown=${errorShown}, msg="${(msgText || '').slice(0, 100)}", pageErrors=${obs.pageErrors.length}`,
    pass: errorShown && exactlyOnePost && noPageErrors,
    before, after,
    notes: !exactlyOnePost ? `Wanted 1 POST, got ${postsThisCell.length}.` :
           !errorShown ? 'Error copy never rendered — handler swallowed the 500.' :
           !noPageErrors ? `Uncaught page errors: ${obs.pageErrors.slice(0, 3).join(' | ')}` : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
