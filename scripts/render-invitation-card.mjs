#!/usr/bin/env node
/**
 * Render the information-session invitation to PNG, twice:
 *
 *   public/images/ma-info-og.png    1200×630  — the link preview. WhatsApp,
 *                                   Gmail, LinkedIn and iMessage all read
 *                                   og:image, and a landscape 1.91:1 frame is
 *                                   the one shape none of them crops badly.
 *   public/images/ma-info-card.png  1080×1350 — the portrait card to send as
 *                                   an image on its own, or to print.
 *
 * Why a headless browser rather than an SVG or a design tool export: the text
 * is Hebrew, and correct Hebrew needs real font shaping. Chromium does that
 * properly with the site's own faces (Frank Ruhl Libre for the display serif,
 * Rubik for the sans), so the card is typographically identical to the page.
 *
 * The fonts are read straight out of node_modules and inlined as data URIs,
 * so the render needs no network and no system font install.
 *
 *   node scripts/render-invitation-card.mjs
 *
 * If Playwright complains that its browser build is missing, point it at an
 * existing Chromium instead of downloading one:
 *
 *   CHROMIUM_PATH=/path/to/chrome node scripts/render-invitation-card.mjs
 *
 * Re-run it after changing anything in src/data/event.js — the card is
 * generated from that same config, so it can never drift from the page.
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT } from '../src/data/event.js';
import { motifSvg } from '../src/data/motif.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/images');

// Matches the page hero: a deep burgundy panel with the type reversed out of
// it, not burgundy type sitting on cream. The card, the hero and the site's
// own signature banner all read as one thing this way.
const PANEL = '#7A1E2B';
const PANEL_DEEP = '#5E1622';
const CREAM = '#F4EFE6';
const CREAM_DIM = 'rgba(244, 239, 230, 0.62)';
const CREAM_FAINT = 'rgba(244, 239, 230, 0.34)';
const HAIRLINE = 'rgba(244, 239, 230, 0.22)';

function fontDataUri(relativePath) {
  const bytes = readFileSync(resolve(ROOT, 'node_modules', relativePath));
  return `data:font/woff2;base64,${bytes.toString('base64')}`;
}

// Frank Ruhl Libre is the Hebrew serif the site already ships; Rubik is its
// Hebrew sans. Both are static/variable woff2 files in node_modules.
const FONTS = {
  serifRegular: fontDataUri('@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-400-normal.woff2'),
  serifBold: fontDataUri('@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-700-normal.woff2'),
  sans: fontDataUri('@fontsource-variable/rubik/files/rubik-hebrew-wght-normal.woff2'),
};

/**
 * One card, laid out for a given frame.
 *
 * Type size (`scale`) and vertical rhythm (`vgap`) are separate knobs on
 * purpose. The 1.91:1 preview is a SHORT frame: scaling the whitespace with
 * the type overflows it, while scaling neither leaves the headline unreadable
 * as a WhatsApp thumbnail. So the wide card gets large type on tight spacing,
 * and the portrait card gets the generous spacing the format can afford.
 */
function cardHtml({ width, height, scale, vgap, padding, motifSize, motifOffset }) {
  const px = (n) => `${(n * scale).toFixed(2)}px`;
  const gap = (n) => `${(n * scale * vgap).toFixed(2)}px`;
  const facts = [
    { label: 'מועד', value: '8.9.2026', sub: 'יום שלישי' },
    { label: 'שעה', value: EVENT.timeLabel, sub: EVENT.timezoneNote },
    { label: 'איפה', value: 'בזום', sub: 'קישור במייל' },
  ];
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'FRL'; src: url('${FONTS.serifRegular}') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'FRL'; src: url('${FONTS.serifBold}') format('woff2'); font-weight: 700; font-display: block; }
  @font-face { font-family: 'RubikHe'; src: url('${FONTS.sans}') format('woff2'); font-weight: 300 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  body {
    background: ${PANEL_DEEP};
    font-family: 'RubikHe', sans-serif;
    color: ${CREAM};
    padding: ${px(padding)};
  }
  .card {
    position: relative; overflow: hidden;
    width: 100%; height: 100%;
    background: radial-gradient(120% 130% at 78% 12%, ${PANEL} 0%, ${PANEL_DEEP} 100%);
    border: ${px(1)} solid ${HAIRLINE};
    border-radius: ${px(20)};
    padding: ${gap(38)} ${px(56)};
    display: flex; flex-direction: column; justify-content: center;
  }
  /* Same grain the site paints over its dark panels — keeps a large flat
     field from looking like a screenshot of a colour swatch. */
  .grain {
    position: absolute; inset: 0;
    background-image: radial-gradient(rgba(244,239,230,0.05) 1px, transparent 1px);
    background-size: 3px 3px;
  }
  .motif {
    position: absolute;
    width: ${motifSize}px; height: ${motifSize}px;
    top: 50%; left: ${motifOffset}px;
    transform: translateY(-46%);
    color: ${CREAM};
    opacity: 0.4;
  }
  .inner { position: relative; }
  .kicker {
    font-size: ${px(15)}; font-weight: 500; color: ${CREAM_DIM};
    letter-spacing: ${px(0.6)}; margin-bottom: ${gap(24)};
  }
  .programme {
    font-family: 'FRL', serif; color: ${CREAM};
    font-size: ${px(50)}; line-height: 1.1;
  }
  .programme .light { font-weight: 400; }
  .programme .strong { font-weight: 700; }
  .rule { width: ${px(80)}; border-top: ${px(2)} solid ${CREAM_FAINT}; margin: ${gap(22)} 0; }
  .lede { font-size: ${px(20)}; color: ${CREAM_DIM}; margin-bottom: ${gap(30)}; }
  /* Dividers are borders, not 1px flex gaps showing a parent colour: the
     panel behind is a gradient, so an opaque cell background would band
     against it. A faint wash lifts the strip off the panel instead. */
  .facts {
    display: flex; border-radius: ${px(12)}; overflow: hidden;
    background: rgba(244, 239, 230, 0.06);
    border: ${px(1)} solid ${HAIRLINE};
  }
  .fact { flex: 1; padding: ${gap(20)} ${px(20)}; }
  .fact + .fact { border-inline-start: ${px(1)} solid ${HAIRLINE}; }
  .fact .l { font-size: ${px(12)}; color: ${CREAM_FAINT}; letter-spacing: ${px(0.6)}; margin-bottom: ${gap(8)}; }
  .fact .v { font-family: 'FRL', serif; font-weight: 400; font-size: ${px(30)}; line-height: 1; margin-bottom: ${gap(6)}; }
  .fact .s { font-size: ${px(14)}; color: ${CREAM_DIM}; }
  .foot {
    display: flex; justify-content: space-between; align-items: baseline; gap: ${px(16)};
    font-size: ${px(15)}; color: ${CREAM_DIM};
    margin-top: ${gap(26)}; padding-top: ${gap(18)};
    border-top: ${px(1)} solid ${HAIRLINE};
  }
  .foot .url { direction: ltr; unicode-bidi: isolate; color: ${CREAM}; font-weight: 600; }
</style></head>
<body>
  <div class="card">
    <div class="grain"></div>
    <div class="motif">${motifSvg({ color: CREAM })}</div>
    <div class="inner">
      <div class="kicker">§ הזמנה &middot; ${EVENT.university} &middot; ${EVENT.department}</div>
      <div class="programme"><span class="light">תואר שני</span><br><span class="strong">בייעוץ ארגוני וקהילתי</span></div>
      <div class="rule"></div>
      <div class="lede">${EVENT.kicker} — הכירו את התכנית</div>
      <div class="facts">
        ${facts
          .map(
            (f) =>
              `<div class="fact"><div class="l">${f.label}</div><div class="v">${f.value}</div><div class="s">${f.sub}</div></div>`
          )
          .join('')}
      </div>
      <div class="foot">
        <span>${EVENT.hosts.join(' &middot; ')}</span>
        <span class="url">${EVENT.pageUrl.replace(/^https?:\/\//, '')}</span>
      </div>
    </div>
  </div>
</body></html>`;
}

const TARGETS = [
  { file: 'ma-info-og.png', width: 1200, height: 630, scale: 1.15, vgap: 0.62, padding: 18, motifSize: 470, motifOffset: -150 },
  { file: 'ma-info-card.png', width: 1080, height: 1350, scale: 1.62, vgap: 2.05, padding: 26, motifSize: 660, motifOffset: -250 },
];

mkdirSync(OUT_DIR, { recursive: true });

// CHROMIUM_PATH is an escape hatch for environments whose installed Chromium
// build doesn't match the one this Playwright version expects (CI sandboxes,
// preinstalled-browser images). Unset locally, Playwright finds its own.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  for (const target of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(cardHtml(target), { waitUntil: 'load' });
    // Webfonts are font-display:block, so text is invisible until they land.
    // Screenshotting before that produces a card with no words on it.
    await page.evaluate(() => document.fonts.ready);
    const out = resolve(OUT_DIR, target.file);
    await page.screenshot({ path: out, type: 'png' });
    await page.close();
    console.log(`rendered ${target.file}  ${target.width}×${target.height}`);
  }
} finally {
  await browser.close();
}
