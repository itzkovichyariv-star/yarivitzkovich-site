#!/usr/bin/env node
/**
 * Refresh metrics.googleScholar from the Scholar profile page — one request.
 *
 * WHY THIS EXISTS ALONGSIDE scholar-sync.py
 * -----------------------------------------
 *   scholar-sync.py asks `scholarly` for sections ["basics","indices",
 *   "publications"]. With 48 papers the publications section pages through
 *   the profile (&cstart=0,20,40…), so a "profile fetch" is really ~5
 *   requests plus an author lookup. That is the job whose daily schedule was
 *   disabled on 2026-05-29 for failing almost every run.
 *
 *   This script wants only the three numbers in the profile's stats box, so
 *   it does exactly ONE GET and parses the `gsc_rsb_std` cells. Whether that
 *   survives Google's datacenter-IP checks is an open question — the point of
 *   this script is to find out without breaking anything while it tries.
 *
 * FAIL-SOFT BY DESIGN
 * -------------------
 *   Google Scholar has no public API and blocks automated access. When the
 *   fetch is challenged, this script exits 0 having changed nothing, so the
 *   daily run goes green-with-a-note instead of red. That matters: the
 *   previous job was disabled because it "was red daily and generated noise".
 *   A blocked run must look different from a broken script, so the exit
 *   reason is always printed and written to $GITHUB_STEP_SUMMARY when set.
 *
 *   It never writes a partial or implausible result: every value must parse
 *   as a non-negative integer, and citations are not allowed to fall (Scholar
 *   counts are monotonic in practice, so a drop means a bad parse, not news).
 *
 * TWO WAYS TO ASK
 * ---------------
 *   --via=fetch   (default) a plain HTTPS GET. Cheapest, no browser download.
 *   --via=browser  the same single page load through headless Chromium.
 *
 *   The difference is fingerprint, not identity: neither signs in, because the
 *   stats box is public and the old job's failures were never auth errors.
 *   A plain fetch is obviously a script (no JS, no real TLS/JA3 profile, no
 *   browser headers), which some of Google's checks key on; a real browser
 *   engine passes those. What neither can change is the runner's datacenter
 *   IP, which is the half of the problem that only a residential proxy
 *   (SCRAPER_API_KEY) solves. So: try fetch, fall back to browser, and if both
 *   are blocked for a week, the answer is a proxy — not more scraping code.
 *
 * WHAT IT WRITES
 * --------------
 *   metrics.googleScholar.{citations,hIndex,i10Index,updatedAt}. The
 *   updatedAt stamp is the contract with the site: display code shows these
 *   numbers only while the stamp is fresh, so a long block makes the figures
 *   disappear rather than silently lie. See isFresh() in src/lib/metrics.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METRICS = path.join(ROOT, 'src/data/metrics.json');
const SCHOLAR_USER = 'HyN_EIgAAAAJ';
// SCHOLAR_PROFILE_URL / SCHOLAR_CHROMIUM_PATH exist so the parser and both
// transports can be exercised against a local fixture. Google is unreachable
// from sandboxed environments, and an untested parser pointed at an endpoint
// nobody can call is how a silent-failure bug ships.
const PROFILE =
  process.env.SCHOLAR_PROFILE_URL ||
  `https://scholar.google.com/citations?user=${SCHOLAR_USER}&hl=en`;
const VIA = (process.argv.find((a) => a.startsWith('--via=')) ?? '--via=fetch').slice(6);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Reports why a run did nothing, for the Actions summary. */
function stop(reason) {
  console.log(`No update: ${reason}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      fs.appendFileSync(summary, `**Scholar metrics not updated** — ${reason}\n`);
    } catch { /* summary is a convenience, never a failure */ }
  }
  process.exit(0);
}

async function viaFetch() {
  const res = await fetch(PROFILE, {
    headers: {
      // Scholar serves the stats box only to browser-shaped requests.
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) stop(`profile returned HTTP ${res.status}`);
  return res.text();
}

async function viaBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    stop('--via=browser needs @playwright/test installed');
  }
  // PLAYWRIGHT_BROWSERS_PATH is honoured when set, so a runner that already
  // caches Chromium does not re-download it.
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    ...(process.env.SCHOLAR_CHROMIUM_PATH ? { executablePath: process.env.SCHOLAR_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newContext({ userAgent: UA, locale: 'en-US' }).then((c) => c.newPage());
    const res = await page.goto(PROFILE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (res && !res.ok()) stop(`profile returned HTTP ${res.status()} (browser)`);
    return await page.content();
  } finally {
    await browser.close();
  }
}

const html = await (async () => {
  try {
    return VIA === 'browser' ? await viaBrowser() : await viaFetch();
  } catch (err) {
    stop(`${VIA} request failed (${err.name}: ${err.message})`);
  }
})();

console.log(`Fetched via ${VIA} (${html.length} bytes).`);

// A challenge page is a 200 with no stats box, so check for it explicitly —
// otherwise a CAPTCHA would read as "profile has no numbers".
if (/gs_captcha|unusual traffic|consent\.google\.com|\/sorry\//i.test(html)) {
  stop('Google served a consent or CAPTCHA page instead of the profile');
}

// The stats table lists all-time and 5-year columns per row, in the order
// Citations, h-index, i10-index — six cells, all-time being every other one.
const cells = [...html.matchAll(/class="gsc_rsb_std">(\d[\d,]*)</g)].map((m) =>
  Number(m[1].replace(/,/g, '')),
);
if (cells.length < 6) {
  stop(`stats box not found in the response (${cells.length} of 6 cells, ${html.length} bytes)`);
}

const next = { citations: cells[0], hIndex: cells[2], i10Index: cells[4] };
if (Object.values(next).some((v) => !Number.isInteger(v) || v < 0)) {
  stop(`implausible values parsed: ${JSON.stringify(next)}`);
}

const metrics = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
const prev = metrics.googleScholar ?? {};

// Scholar's totals only ever climb; a fall means the parse grabbed the wrong
// cells (a layout change), which must not overwrite good data.
if (typeof prev.citations === 'number' && next.citations < prev.citations) {
  stop(`citations fell ${prev.citations} → ${next.citations}; treating as a bad parse`);
}

const unchanged =
  prev.citations === next.citations &&
  prev.hIndex === next.hIndex &&
  prev.i10Index === next.i10Index;

metrics.googleScholar = {
  ...prev,
  ...next,
  source: 'Google Scholar',
  url: `https://scholar.google.com/citations?user=${SCHOLAR_USER}`,
  updatedAt: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync(METRICS, `${JSON.stringify(metrics, null, 2)}\n`);

console.log(
  unchanged
    ? `Values unchanged (${next.citations} citations, h-index ${next.hIndex}); refreshed updatedAt.`
    : `Updated: ${prev.citations ?? '—'} → ${next.citations} citations, ` +
      `h-index ${prev.hIndex ?? '—'} → ${next.hIndex}, i10 ${prev.i10Index ?? '—'} → ${next.i10Index}.`,
);
