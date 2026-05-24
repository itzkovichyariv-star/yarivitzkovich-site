/**
 * JCR Data Collector — paste this entire script into Chrome DevTools console
 * while you are logged into jcr.clarivate.com.
 *
 * It will navigate to each journal, read the metrics, then POST everything
 * to your API in one go.
 *
 * Usage:
 *   1. Log into https://jcr.clarivate.com in Chrome
 *   2. Open DevTools (⌘+Option+J)
 *   3. Paste this entire script and press Enter
 *   4. Wait ~5 minutes while it collects all 27 journals
 *   5. Done — check the console for the summary
 */

const API_URL  = "https://yarivitzkovich.org/api/journal-sync";
const QC_TOKEN = "494fc30488a603d7e8c7c9ce5ae27298f61420f47a9723ecb08cf46b57c076c1";

const JOURNALS = [
  "Current Psychology",
  "Deviant Behavior",
  "Disability and Rehabilitation",
  "Entrepreneurship Research Journal",
  "Ethics & Behavior",
  "EuroMed Journal of Business",
  "Frontiers in Psychology",
  "Higher Education",
  "Human-Computer Interaction",
  "Information and Software Technology",
  "International Journal of Environmental Research and Public Health",
  "International Journal of Work Organization and Emotion",
  "International Journal of Workplace Health Management",
  "Journal of Academic Ethics",
  "Journal of Aggression, Maltreatment & Trauma",
  "Journal of Cleaner Production",
  "Journal of Entrepreneurship",
  "Journal of Management Development",
  "Journal of Management Research",
  "Journal of Managerial Psychology",
  "Journal of Social Work",
  "Nonprofit Management & Leadership",
  "Personnel Review",
  "Societies",
  "Sustainability",
  "Wirtschaftspsychologie",
  "Work",
];

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function wordOverlap(a, b) {
  const wa = new Set(norm(a).split(" "));
  const wb = new Set(norm(b).split(" "));
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return inter / Math.max(union, 1);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Navigate and wait for a CSS selector to appear
async function navigateAndWait(url, selector, timeoutMs = 15000) {
  location.href = url;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(500);
    if (document.querySelector(selector)) return true;
  }
  return false;
}

// Wait for selector to appear (without navigation)
async function waitFor(selector, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (document.querySelector(selector)) return true;
    await sleep(400);
  }
  return false;
}

// Extract IF, quartile, percentile from current page body text
function extractMetrics() {
  const text = document.body.innerText;

  let impact_factor = null;
  let jcr_quartile  = null;
  let percentile    = null;

  // Impact Factor
  const mIF = text.match(/(?:impact factor|jif)[^\d]*(\d[\d,]*\.?\d*)/i);
  if (mIF) {
    const v = parseFloat(mIF[1].replace(",", "."));
    if (!isNaN(v)) impact_factor = v;
  }

  // JCR Quartile — take the best (lowest number) Q found on page
  const qs = [...text.matchAll(/\bQ([1-4])\b/g)].map(m => parseInt(m[1]));
  if (qs.length) jcr_quartile = "Q" + Math.min(...qs);

  // Percentile
  let mPct = text.match(/(\d{1,3})(?:st|nd|rd|th)?\s*percentile/i);
  if (!mPct) mPct = text.match(/percentile[^\d]*(\d{1,3})/i);
  if (mPct) {
    const v = parseInt(mPct[1], 10);
    if (!isNaN(v) && v <= 100) percentile = v;
  }

  return { impact_factor, jcr_quartile, percentile };
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  const RESULT_ROW_SEL =
    "app-journal-list-item, .journal-list-item, " +
    "[class*='journal-row'], [class*='journal-item']";

  const results = [];

  for (let i = 0; i < JOURNALS.length; i++) {
    const journal = JOURNALS[i];
    console.log(`[${i + 1}/${JOURNALS.length}] ${journal}`);

    const searchUrl =
      `https://jcr.clarivate.com/jcr/browse-journals` +
      `?search=${encodeURIComponent(journal)}`;

    // Navigate to search results
    location.href = searchUrl;
    const found = await waitFor(RESULT_ROW_SEL, 15000);

    if (!found) {
      console.warn(`  ✗ No results page loaded`);
      await sleep(4000);
      continue;
    }

    await sleep(1500); // let Angular finish rendering

    // Pick best-matching row
    const rows = [...document.querySelectorAll(RESULT_ROW_SEL)];
    let bestRow = null, bestScore = 0;
    for (const row of rows) {
      const firstLine = (row.innerText || "").split("\n")[0].trim();
      const score = wordOverlap(journal, firstLine);
      if (score > bestScore) { bestScore = score; bestRow = row; }
    }

    if (!bestRow || bestScore < 0.4) {
      console.warn(`  ✗ No confident match (score ${bestScore.toFixed(2)})`);
      await sleep(3000);
      continue;
    }

    console.log(`  ✓ Matched (score ${bestScore.toFixed(2)}) — clicking …`);
    bestRow.click();
    await sleep(5000); // wait for detail page

    const { impact_factor, jcr_quartile, percentile } = extractMetrics();

    if (!impact_factor && !jcr_quartile && !percentile) {
      console.warn(`  ✗ Could not extract metrics from detail page`);
      await sleep(3000);
      continue;
    }

    const q = jcr_quartile || "?";
    console.log(
      `  → ${q} | IF ${impact_factor != null ? impact_factor.toFixed(3) : "n/a"}` +
      ` | Percentile ${percentile ?? "n/a"}`
    );

    results.push({
      journal_key:   norm(journal),
      journal_name:  journal,
      impact_factor,
      jcr_quartile:  jcr_quartile || null,
      percentile,
    });

    await sleep(3000); // polite pause between journals
  }

  // ── POST ──────────────────────────────────────────────────────────────────

  console.log(`\nCollected ${results.length}/${JOURNALS.length} journals.`);
  console.log("POSTing to API …");

  try {
    const resp = await fetch(API_URL, {
      method:  "POST",
      headers: {
        "content-type": "application/json",
        "x-qc-token":   QC_TOKEN,
      },
      body: JSON.stringify({ journals: results }),
    });
    const text = await resp.text();
    console.log(`Response ${resp.status}: ${text.slice(0, 300)}`);
    if (resp.ok) {
      console.log("✅ Done! JCR metrics saved to D1.");
    } else {
      console.error("❌ API returned an error — see response above.");
    }
  } catch (e) {
    console.error("❌ Fetch failed:", e);
  }

  console.table(results.map(r => ({
    Journal: r.journal_name.slice(0, 40),
    Q: r.jcr_quartile || "?",
    IF: r.impact_factor?.toFixed(3) ?? "n/a",
    Pct: r.percentile ?? "n/a",
  })));
})();
