#!/usr/bin/env node
/**
 * make-whatsapp-qr.mjs — generate the shareable WhatsApp contact image.
 *
 * Produces a 1080×1080 PNG that matches the live site's contact footer:
 *   • Maroon (#7A1E2B) full-bleed background — NO white/cream panel.
 *   • Frameless / inverted vCard QR: cream (#F4EFE6) modules directly on the
 *     maroon, with rounded finder eyes and a centered maroon "Y" disc — the
 *     exact same style as src/components/ContactQR.astro (the version live on
 *     yarivitzkovich.org).
 *   • Caption stack at the bottom, in light text on the maroon:
 *       Dr. Yariv Itzkovich  /  ARIEL UNIVERSITY  /  SCAN TO SAVE MY CONTACT
 *
 * The QR encodes the IDENTICAL vCard as the site (length asserted === 287), so
 * it's the same scannable code. The script decode-verifies the rendered QR
 * with jsQR (inversionAttempts: 'attemptBoth') before writing the PNG — it
 * refuses to save an unscannable image.
 *
 * Run:  node scripts/make-whatsapp-qr.mjs
 * Out:  ~/Downloads/yariv-qr-whatsapp-maroon.png
 */
import QRCode from 'qrcode';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const JSQR_PATH = path.join(path.dirname(require.resolve('jsqr')), 'jsQR.js');
const OUT = path.join(homedir(), 'Downloads', 'yariv-qr-whatsapp-maroon.png');

const BG = '#7A1E2B';   // --color-accent (maroon)
const FG = '#F4EFE6';   // --color-bg (cream)
const SOFT = '#D98B9A'; // --color-accent-on-dark (light maroon, for the org line)

// vCard 3.0 — must be byte-identical to src/components/ContactQR.astro.
const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Itzkovich;Yariv;;;',
  'FN:Yariv Itzkovich',
  'ORG:Ariel University',
  'TITLE:Associate Editor, Journal of Managerial Psychology',
  'EMAIL:Yarivi@ariel.ac.il',
  'TEL;TYPE=CELL:+972523975027',
  'URL:https://yarivitzkovich.org',
  'URL:https://orcid.org/0000-0002-3296-6518',
  'END:VCARD',
].join('\r\n');

if (VCARD.length !== 287) {
  console.error(`✗ vCard length ${VCARD.length} ≠ 287 — drifted from ContactQR.astro. Aborting.`);
  process.exit(1);
}

// Build the inverted QR SVG, same module/finder geometry as ContactQR.astro,
// plus an embedded maroon center disc + cream "Y" (drawn in-SVG so the PNG is
// self-contained and the decode test sees the real center obstruction).
function buildQrSvg() {
  const qr = QRCode.create(VCARD, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const dark = (r, c) => (r >= 0 && c >= 0 && r < size && c < size ? data[r * size + c] : 0);
  const M = 1;
  const dim = size + M * 2;
  const inFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  const finder = (x, y) =>
    `<rect x="${x}" y="${y}" width="7" height="7" rx="2.1" fill="${FG}"/>` +
    `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.4" fill="${BG}"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${FG}"/>`;
  let body = `<rect width="${dim}" height="${dim}" fill="${BG}"/>`;
  body += finder(M, M) + finder(M + size - 7, M) + finder(M, M + size - 7);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue;
      body += `<rect x="${c + M - 0.05}" y="${r + M - 0.05}" width="1.1" height="1.1" rx="0.4" fill="${FG}"/>`;
    }
  }
  // Center "Y" monogram: maroon disc (clears cream modules) + cream serif Y.
  const cx = dim / 2, cy = dim / 2, rDisc = dim * 0.085;
  body += `<circle cx="${cx}" cy="${cy}" r="${rDisc}" fill="${BG}"/>`;
  body += `<text x="${cx}" y="${cy}" fill="${FG}" font-family="Fraunces, Georgia, serif" font-weight="600" font-size="${rDisc * 1.25}" text-anchor="middle" dominant-baseline="central">Y</text>`;
  return { svg: `<svg id="qrsvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="geometricPrecision">${body}</svg>`, modules: size };
}

const { svg, modules } = buildQrSvg();

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; }
  body {
    background: ${BG};
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 56px;
    font-synthesis: none; -webkit-font-smoothing: antialiased;
  }
  #qr { width: 600px; height: 600px; }
  #qr svg { width: 100%; height: 100%; display: block; }
  .caption { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .name {
    font-family: "Fraunces", Georgia, serif; font-weight: 600;
    font-size: 52px; color: ${FG}; letter-spacing: 0.01em; line-height: 1;
  }
  .rule { width: 54px; height: 2px; background: ${SOFT}; opacity: 0.8; margin: 4px 0; border-radius: 2px; }
  .org {
    font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 500;
    font-size: 22px; color: ${SOFT}; letter-spacing: 0.28em; text-transform: uppercase;
  }
  .scan {
    font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 400;
    font-size: 18px; color: ${FG}; opacity: 0.62;
    letter-spacing: 0.22em; text-transform: uppercase;
  }
</style></head>
<body>
  <div id="qr">${svg}</div>
  <div class="caption">
    <div class="name">Dr. Yariv Itzkovich</div>
    <div class="rule"></div>
    <div class="org">Ariel University</div>
    <div class="scan">Scan to save my contact</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

// ---- decode-verify the rendered QR before saving ----
await page.addScriptTag({ path: JSQR_PATH });
const decoded = await page.evaluate(async () => {
  const svgEl = document.querySelector('#qr svg');
  const xml = new XMLSerializer().serializeToString(svgEl);
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const N = 760;
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#7A1E2B'; ctx.fillRect(0, 0, N, N);
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N);
  // eslint-disable-next-line no-undef
  const code = jsQR(d.data, N, N, { inversionAttempts: 'attemptBoth' });
  return code ? code.data : null;
});

const ok = decoded && decoded.replace(/\r/g, '') === VCARD.replace(/\r/g, '');
if (!ok) {
  console.error('✗ DECODE FAILED — generated QR did not read back as the vCard. Not saving.');
  console.error('  decoded:', decoded ? JSON.stringify(decoded.slice(0, 60)) + '…' : 'null');
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: OUT });
await browser.close();
console.log(`✓ vCard length 287 OK · QR ${modules}×${modules} modules · decode-verified (vCard match)`);
console.log(`✓ wrote ${OUT} (1080×1080 @2x)`);
