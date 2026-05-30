#!/usr/bin/env node
/**
 * 11-contact-qr.mjs — the vCard QR in the contact zone is present AND
 * actually scannable.
 *
 * Cell map:
 *   QR-present        Exactly one [data-contact-qr] figure lives inside
 *                     the #contact footer, and it contains an <svg>.
 *   QR-decodes        The RENDERED tile (QR svg + center monogram overlay,
 *                     exactly what a phone camera sees) is screenshotted
 *                     and decoded with jsQR. The decoded payload must be a
 *                     vCard carrying the real email, phone, website, and
 *                     ORCID. This is the cell that proves the code SCANS —
 *                     not just that an <svg> exists. It also proves the
 *                     center monogram doesn't obstruct enough to break the
 *                     error-correction.
 *   QR-no-secrets     Defense-in-depth: the decoded vCard must NOT contain
 *                     anything that looks like a login token / credential.
 *                     The QR is a public contact card by design; this guards
 *                     against someone later repurposing it into a magic-link
 *                     "scan to log in" code, which would be a public
 *                     credential leak.
 *
 * Decode strategy: Playwright screenshots the .qr-tile element to a PNG,
 * we hand the PNG back into the page, draw it to a canvas, read ImageData,
 * and run jsQR (injected from node_modules). Round-tripping the actual
 * pixels is the only honest "does the camera see a valid code" test.
 */
import { Audit, ROOT } from '../audit-lib.mjs';

const JSQR_PATH = `${ROOT}/node_modules/jsqr/dist/jsQR.js`;

// deviceScaleFactor 3 mimics a modern phone screen: the rendered QR has
// real sub-pixels per module, so the decode test reflects what a camera
// actually sees rather than a dpr-1 aliased downscale.
const audit = new Audit({ name: 'contact-qr', deviceScaleFactor: 3 });
await audit.setup();

await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'networkidle' });
await audit.page.waitForTimeout(400);
// The footer is at the bottom; scroll it into view so it paints.
await audit.page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
await audit.page.waitForTimeout(400);

// ─── QR-present ─────────────────────────────────────────────────────
{
  const figCount = await audit.page.locator('#contact [data-contact-qr]').count();
  const svgCount = await audit.page.locator('#contact [data-contact-qr] svg').count();
  const after = await audit.shot('QR-present');
  audit.recordCell({
    id: 'QR-present',
    tableRef: '#contact [data-contact-qr]',
    expected: 'exactly one QR figure in the contact footer, containing an <svg>',
    observed: `figures=${figCount}, svgs=${svgCount}`,
    pass: figCount === 1 && svgCount >= 1,
    after,
    notes: figCount !== 1 ? `Expected 1 QR figure, found ${figCount}.` :
           svgCount < 1 ? 'QR figure present but no <svg> inside — generation may have failed at build time.' : '',
  });
}

// ─── QR-decodes ─────────────────────────────────────────────────────
let decoded = null;
{
  await audit.page.addScriptTag({ path: JSQR_PATH });
  // Screenshot the visible composite tile (svg + monogram overlay).
  const png = await audit.page.locator('#contact [data-contact-qr] .qr-tile').screenshot();
  const b64 = png.toString('base64');

  decoded = await audit.page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    // Upscale for a comfortable decode margin.
    const N = Math.max(img.naturalWidth, 512);
    const canvas = document.createElement('canvas');
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, N, N);
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);
    // jsQR is attached to window by the injected UMD bundle.
    const code = window.jsQR(data, N, N);
    return code ? code.data : null;
  }, b64);

  const after = await audit.shot('QR-decodes');
  const isVcard = !!decoded && decoded.startsWith('BEGIN:VCARD') && decoded.includes('END:VCARD');
  const hasEmail = !!decoded && /EMAIL[^:]*:Yarivi@ariel\.ac\.il/i.test(decoded);
  const hasTel = !!decoded && decoded.includes('+972523975027');
  const hasUrl = !!decoded && decoded.includes('yarivitzkovich.org');
  const hasOrcid = !!decoded && decoded.includes('orcid.org/0000-0002-3296-6518');

  audit.recordCell({
    id: 'QR-decodes',
    tableRef: 'rendered QR tile -> jsQR decode',
    expected: 'decodes to a vCard containing the email, phone (+972523975027), website, and ORCID',
    observed: decoded
      ? `decoded ${decoded.length} chars; vcard=${isVcard}, email=${hasEmail}, tel=${hasTel}, url=${hasUrl}, orcid=${hasOrcid}`
      : 'jsQR could not decode the rendered tile',
    pass: isVcard && hasEmail && hasTel && hasUrl && hasOrcid,
    after,
    notes: !decoded ? 'No decode — the monogram overlay may be obstructing too much, or contrast is too low to scan.' :
           !isVcard ? `Decoded but not a vCard: "${decoded.slice(0, 80)}"` :
           !hasEmail ? 'vCard missing the email field.' :
           !hasTel ? 'vCard missing the +972523975027 phone.' :
           !hasUrl ? 'vCard missing the website URL.' :
           !hasOrcid ? 'vCard missing the ORCID URL.' : '',
  });
}

// ─── QR-no-secrets ──────────────────────────────────────────────────
{
  // The QR must remain a public contact card. If a future change ever
  // stuffs a token/credential/login URL into it, that token becomes a
  // public secret (anyone scanning the public page gets it). Fail loudly.
  const lower = (decoded || '').toLowerCase();
  const suspicious = ['token=', 'secret', 'password', 'jwt', 'bearer', 'apikey', 'api_key', 'login?', '/auth', 'magic'];
  const hits = suspicious.filter((s) => lower.includes(s));
  audit.recordCell({
    id: 'QR-no-secrets',
    tableRef: 'decoded vCard contains no credential-like material',
    expected: 'no token/secret/password/login-link substrings in the QR payload',
    observed: hits.length ? `SUSPICIOUS substrings: ${hits.join(', ')}` : 'clean — contact data only',
    pass: hits.length === 0,
    notes: hits.length ? `The QR payload looks like it carries a credential (${hits.join(', ')}). A public QR must never embed login material.` : '',
  });
}

// ─── QR-decodes-mobile ──────────────────────────────────────────────
// The QR shrinks on phones (132px vs 168px) so it doesn't dominate the
// stacked footer. Smaller = denser = a scannability risk, so prove the
// mobile size still decodes at a retina scale (the context is already
// deviceScaleFactor 3). Resize to a phone width and re-decode.
{
  await audit.page.setViewportSize({ width: 390, height: 844 });
  await audit.page.goto(`${audit.baseUrl}/`, { waitUntil: 'networkidle' });
  await audit.page.addScriptTag({ path: JSQR_PATH }); // re-inject: the goto wiped the earlier one
  await audit.page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
  await audit.page.waitForTimeout(400);

  const tileW = await audit.page.locator('#contact [data-contact-qr] .qr-tile')
    .evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
  const png = await audit.page.locator('#contact [data-contact-qr] .qr-tile').screenshot();
  const decodedM = await audit.page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const N = Math.max(img.naturalWidth, 512);
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.drawImage(img, 0, 0, N, N);
    const code = window.jsQR(x.getImageData(0, 0, N, N).data, N, N);
    return code ? code.data : null;
  }, png.toString('base64'));

  const shrunk = tileW > 0 && tileW < 150;            // confirms the mobile media query applied
  const decodes = !!decodedM && decodedM.startsWith('BEGIN:VCARD');
  audit.recordCell({
    id: 'QR-decodes-mobile',
    tableRef: 'mobile (390px) QR tile -> jsQR decode',
    expected: 'QR shrinks below 150px on phones AND still decodes to a vCard',
    observed: `tileWidth=${Math.round(tileW)}px, decodes=${decodes}`,
    pass: shrunk && decodes,
    notes: !shrunk ? `Mobile tile is ${Math.round(tileW)}px — expected <150px (the @media shrink didn't apply).` :
           !decodes ? 'Mobile QR too small/dense to scan — bump the mobile max-width back up.' : '',
  });
}

await audit.teardown();
process.exit(audit.cells.some((c) => c.pass === false) ? 1 : 0);
