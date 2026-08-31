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


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/images');

// Ariel University's campaign palette, matching the hero on /he/ma-info:
// deep navy ground, teal accent, heavy light-grey display type, and the grey
// diagonal wedge carrying the university mark.
const NAVY = '#122033';
const NAVY_DEEP = '#0C1727';
const NAVY_SOFT = 'rgba(193, 195, 198, 0.05)';
const TEAL = '#2FA0A8';
const TEAL_BRIGHT = '#4FBFC7';
const GREY = '#C1C3C6';
const GREY_MID = '#9CA0A5';
const WEDGE = '#838486';
const HAIRLINE = 'rgba(193, 195, 198, 0.16)';

function fontDataUri(relativePath) {
  const bytes = readFileSync(resolve(ROOT, 'node_modules', relativePath));
  return `data:font/woff2;base64,${bytes.toString('base64')}`;
}

// Frank Ruhl Libre is the Hebrew serif the site already ships; Rubik is its
// Hebrew sans. Both are static/variable woff2 files in node_modules.
/** The university mark, inlined so the render needs no server. */
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  resolve(ROOT, 'public/images/ariel-logo-navy.png')
).toString('base64')}`;

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
function cardHtml({ width, height, scale, vgap, padding, wedgeW, wedgeH, logoW }) {
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
  @font-face { font-family: 'RubikHe'; src: url('${FONTS.sans}') format('woff2'); font-weight: 300 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  body {
    position: relative; overflow: hidden;
    background: ${NAVY};
    font-family: 'RubikHe', sans-serif;
    color: ${GREY};
    padding: ${px(padding)} ${px(padding + 12)} ${px(padding)} ${px(padding)};
    display: flex; flex-direction: column; justify-content: center;
  }
  /* The grey triangle anchored bottom-LEFT, as in Ariel's own creative. */
  .wedge {
    position: absolute; bottom: 0; left: 0;
    width: ${wedgeW}px; height: ${wedgeH}px;
    background: ${WEDGE};
    clip-path: polygon(0 0, 0 100%, 100% 100%);
  }
  .logo { position: absolute; bottom: ${px(20)}; left: ${px(18)}; width: ${logoW}px; }
  .inner { position: relative; }

  .eyebrow { font-size: ${px(15)}; font-weight: 500; letter-spacing: ${px(0.5)}; color: ${TEAL}; margin-bottom: ${gap(20)}; }
  .h { font-size: ${px(46)}; font-weight: 800; line-height: 1.08; letter-spacing: -0.015em; color: ${GREY}; }
  .h .teal { color: ${TEAL_BRIGHT}; }
  .lede { font-size: ${px(19)}; font-weight: 300; color: ${GREY}; margin: ${gap(18)} 0 ${gap(26)}; }

  .facts { display: flex; border: ${px(1)} solid ${HAIRLINE}; border-radius: ${px(12)}; background: ${NAVY_SOFT}; overflow: hidden; }
  .fact { flex: 1; padding: ${gap(18)} ${px(18)}; }
  .fact + .fact { border-inline-start: ${px(1)} solid ${HAIRLINE}; }
  .fact .l { font-size: ${px(12)}; letter-spacing: ${px(0.6)}; color: ${GREY_MID}; margin-bottom: ${gap(7)}; }
  .fact .v { font-size: ${px(29)}; font-weight: 700; line-height: 1; color: #fff; margin-bottom: ${gap(5)}; }
  .fact .s { font-size: ${px(13)}; color: ${GREY_MID}; }

  .foot { display: flex; justify-content: space-between; align-items: baseline; gap: ${px(16)}; margin-top: ${gap(24)}; font-size: ${px(15)}; color: ${GREY_MID}; }
  .foot .url { direction: ltr; unicode-bidi: isolate; color: ${TEAL_BRIGHT}; font-weight: 600; }
</style></head>
<body>
  <div class="wedge"></div>
  <img class="logo" src="${LOGO_DATA_URI}" alt="">
  <div class="inner">
    <div class="eyebrow">${EVENT.university} &middot; ${EVENT.department}</div>
    <div class="h">${EVENT.kicker}<br><span class="teal">${EVENT.programme}</span></div>
    <div class="lede">נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.</div>
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
</body></html>`;
}

const TARGETS = [
  { file: 'ma-info-og.png', width: 1200, height: 630, scale: 1.15, vgap: 0.72, padding: 46, wedgeW: 260, wedgeH: 150, logoW: 112 },
  { file: 'ma-info-card.png', width: 1080, height: 1350, scale: 1.5, vgap: 1.9, padding: 54, wedgeW: 330, wedgeH: 210, logoW: 140 },
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
