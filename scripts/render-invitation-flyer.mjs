#!/usr/bin/env node
/**
 * Render the invitation as images for pasting into a mail client.
 *
 * Two shapes, because they do different jobs:
 *
 *   ma-info-flyer.png    600×1083 (2x) — the whole invitation, for the BODY of
 *                        an email. Everything a reader needs without leaving
 *                        the message.
 *   ma-info-banner.png   1520×340       — a wide strip in the same proportions
 *                        as signature-banner.png, so it drops into an email
 *                        SIGNATURE exactly where the existing banner sits.
 *
 * Why images at all: getting designed HTML into Outlook by hand keeps failing.
 * Copying the rendered page out of a browser puts both a URL and the markup on
 * the clipboard, and Outlook takes the URL — the paste arrives as a bare link.
 * An image has no such ambiguity.
 *
 * Both are meant to be HYPERLINKED in the mail client (insert the picture,
 * select it, add a link to the landing page), which is how the existing
 * signature banner already works. Serve them from their public URL rather than
 * dragging the local file in: a dragged file becomes an inert embedded
 * attachment, while an image inserted from a URL behaves like the banner that
 * already works.
 *
 * In an email body, keep a text link under the flyer as well — most clients
 * block remote images until the reader allows them, and for those readers an
 * image-only email is a blank rectangle with nothing to click.
 *
 *   node scripts/render-invitation-flyer.mjs
 *   CHROMIUM_PATH=/path/to/chrome node scripts/render-invitation-flyer.mjs
 *
 * Re-run after changing src/data/event.js — every fact here comes from it.
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT } from '../src/data/event.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/images');

const NAVY = '#122033';
const NAVY_DEEP = '#0C1727';
const TEAL = '#2FA0A8';
const TEAL_BRIGHT = '#4FBFC7';
const GREY = '#C1C3C6';
const GREY_MID = '#9CA0A5';
const WEDGE = '#838486';
const HAIRLINE = 'rgba(193, 195, 198, 0.18)';

const font = (p) => `data:font/woff2;base64,${readFileSync(resolve(ROOT, 'node_modules', p)).toString('base64')}`;
const RUBIK = font('@fontsource-variable/rubik/files/rubik-hebrew-wght-normal.woff2');
const LOGO = `data:image/png;base64,${readFileSync(resolve(ROOT, 'public/images/ariel-logo-navy.png')).toString('base64')}`;

// 600 CSS px wide is the width every mail client lays a body out at; rendering
// at deviceScaleFactor 2 keeps it crisp on a retina screen.
const WIDTH = 600;

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'RubikHe'; src: url('${RUBIK}') format('woff2'); font-weight: 300 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${WIDTH}px; background: ${NAVY_DEEP}; font-family: 'RubikHe', sans-serif; color: ${GREY}; }
  .sheet { position: relative; overflow: hidden; background: ${NAVY}; padding: 46px 44px 150px; }
  .wedge { position: absolute; bottom: 0; left: 0; width: 250px; height: 150px; background: ${WEDGE}; clip-path: polygon(0 0, 0 100%, 100% 100%); }
  .logo  { position: absolute; bottom: 20px; left: 16px; width: 108px; }
  .body  { position: relative; }

  .kicker { font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: ${TEAL}; margin-bottom: 22px; }
  h1 { font-size: 34px; font-weight: 800; line-height: 1.12; color: ${GREY}; }
  h1 .teal { color: ${TEAL_BRIGHT}; }
  .rule { width: 70px; border-top: 2px solid ${HAIRLINE}; margin: 24px 0; }

  p { font-size: 16px; line-height: 1.7; color: ${GREY}; margin-bottom: 14px; }
  .dim { color: ${GREY_MID}; }

  .when {
    border: 1px solid ${HAIRLINE}; border-radius: 14px;
    background: rgba(193,195,198,0.05);
    padding: 22px 24px; margin: 26px 0;
  }
  .when-l { font-size: 12px; letter-spacing: 0.1em; color: ${GREY_MID}; margin-bottom: 10px; }
  .when-v { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.4; }
  .when-tz { font-size: 14px; font-weight: 400; color: ${GREY_MID}; }

  .days { display: flex; gap: 12px; margin: 26px 0; }
  .day { flex: 1; border: 1px solid ${HAIRLINE}; border-radius: 12px; padding: 16px 18px; }
  .day-t { font-size: 17px; font-weight: 700; color: ${TEAL_BRIGHT}; margin-bottom: 5px; }
  .day-s { font-size: 13px; color: ${GREY_MID}; }

  .cta { font-size: 19px; font-weight: 700; color: ${TEAL_BRIGHT}; margin: 30px 0 6px; }
  .cta-s { font-size: 14px; color: ${GREY_MID}; }
  .sign { font-size: 16px; color: ${GREY}; margin-top: 30px; padding-top: 22px; border-top: 1px solid ${HAIRLINE}; line-height: 1.7; }
</style></head>
<body>
  <div class="sheet">
    <div class="wedge"></div>
    <img class="logo" src="${LOGO}" alt="">
    <div class="body">
      <div class="kicker">${EVENT.university} &middot; ${EVENT.department}</div>
      <h1>${EVENT.kicker}<br><span class="teal">${EVENT.programme}</span></h1>
      <div class="rule"></div>

      <p>שלום רב,</p>
      <p class="dim">שמחים להזמינך למפגש זום בנושא תכנית לתואר שני במחלקה לסוציולוגיה ולאנתרופולוגיה, עם התמחות בייעוץ ארגוני וקהילתי.</p>
      <p class="dim">במפגש נסביר על התכנית ועל היתרונות שבה, ונקיים שיחה פתוחה ומענה על שאלות.</p>

      <div class="when">
        <div class="when-l">מועד המפגש</div>
        <div class="when-v">${EVENT.dateLabel}<br>בשעה ${EVENT.timeLabel} <span class="when-tz">(${EVENT.timezoneNote})</span></div>
      </div>

      <p class="dim">מתכונת הלימודים בשנת ${EVENT.academicYear}:</p>
      <div class="days">
        <div class="day"><div class="day-t">ימי שלישי</div><div class="day-s">משעה 15:00 · פרונטלי</div></div>
        <div class="day"><div class="day-t">ימי שישי</div><div class="day-s">בזום</div></div>
      </div>

      <p class="dim">זאת הזדמנות נוספת לקבל החלטה מושכלת, רגע לפני שמתחילה השנה החדשה.</p>

      <div class="cta">לפרטים ולהרשמה — לחצו על ההזמנה או על הקישור שמתחתיה</div>
      <div class="cta-s">ההשתתפות ללא עלות · לאחר ההרשמה יישלח אליכם קישור הזום</div>

      <div class="sign">${EVENT.hosts[0]}<br>ו${EVENT.hosts[1]}</div>
    </div>
  </div>
</body></html>`;

/**
 * The wide signature strip. Deliberately terse: at 600 px wide in a signature
 * it is only ~134 px tall, so it carries the programme, the date and a call to
 * action, and nothing else. Anything more becomes unreadable at that height.
 */
const BANNER_W = 760;   // rendered at 2x → 1520, matching signature-banner.png
const BANNER_H = 170;   // → 340

const bannerHtml = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'RubikHe'; src: url('${RUBIK}') format('woff2'); font-weight: 300 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${BANNER_W}px; height: ${BANNER_H}px; }
  body {
    position: relative; overflow: hidden;
    background: ${NAVY};
    font-family: 'RubikHe', sans-serif; color: ${GREY};
    display: flex; align-items: center;
    padding: 0 30px 0 190px;
  }
  .wedge { position: absolute; bottom: 0; left: 0; width: 168px; height: ${BANNER_H}px; background: ${WEDGE}; clip-path: polygon(0 0, 0 100%, 100% 100%); }
  .logo  { position: absolute; bottom: 16px; left: 14px; width: 92px; }
  .txt   { position: relative; width: 100%; }
  .k  { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; color: ${TEAL}; margin-bottom: 7px; }
  .h  { font-size: 23px; font-weight: 800; line-height: 1.15; color: ${GREY}; }
  .h .teal { color: ${TEAL_BRIGHT}; }
  .d  { font-size: 15px; font-weight: 700; color: #fff; margin-top: 9px; }
  .d .cta { color: ${TEAL_BRIGHT}; font-weight: 600; }
</style></head>
<body>
  <div class="wedge"></div>
  <img class="logo" src="${LOGO}" alt="">
  <div class="txt">
    <div class="k">${EVENT.university} &middot; ${EVENT.department}</div>
    <div class="h">${EVENT.kicker} &middot; <span class="teal">${EVENT.programme}</span></div>
    <div class="d">${EVENT.dateLabel}, ${EVENT.timeLabel} &nbsp;<span class="cta">· לפרטים ולהרשמה לחצו כאן</span></div>
  </div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  // Full-height flyer for an email body.
  const flyer = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2 });
  await flyer.setContent(html, { waitUntil: 'load' });
  await flyer.evaluate(() => document.fonts.ready);
  await flyer.screenshot({ path: resolve(OUT_DIR, 'ma-info-flyer.png'), type: 'png', fullPage: true });
  const box = await flyer.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight]);
  console.log(`rendered ma-info-flyer.png   ${box[0] * 2}×${box[1] * 2}`);
  await flyer.close();

  // Wide strip for an email signature.
  const banner = await browser.newPage({ viewport: { width: BANNER_W, height: BANNER_H }, deviceScaleFactor: 2 });
  await banner.setContent(bannerHtml, { waitUntil: 'load' });
  await banner.evaluate(() => document.fonts.ready);
  await banner.screenshot({ path: resolve(OUT_DIR, 'ma-info-banner.png'), type: 'png' });
  console.log(`rendered ma-info-banner.png  ${BANNER_W * 2}×${BANNER_H * 2}`);
  await banner.close();
} finally {
  await browser.close();
}
