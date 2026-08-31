#!/usr/bin/env node
/**
 * Render the whole invitation as ONE image, for pasting into a mail client.
 *
 * Why this exists: getting designed HTML into Outlook by hand keeps failing —
 * the clipboard carries a URL flavour and Outlook pastes a link instead of the
 * content. An image has no such ambiguity: every mail client embeds a picture
 * dropped into the body, and it arrives looking exactly like the design.
 *
 * Use it WITH a line of real text underneath carrying the link, never alone:
 * most clients block remote images until the reader allows them, and an
 * image-only email arrives as a blank rectangle for those readers.
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

      <div class="cta">לפרטים ולהרשמה — הקישור מתחת לתמונה</div>
      <div class="cta-s">ההשתתפות ללא עלות · לאחר ההרשמה יישלח אליכם קישור הזום</div>

      <div class="sign">${EVENT.hosts[0]}<br>ו${EVENT.hosts[1]}</div>
    </div>
  </div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const out = resolve(OUT_DIR, 'ma-info-flyer.png');
  await page.screenshot({ path: out, type: 'png', fullPage: true });
  const box = await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight]);
  console.log(`rendered ma-info-flyer.png  ${box[0] * 2}×${box[1] * 2} (2x of ${box[0]}×${box[1]})`);
} finally {
  await browser.close();
}
