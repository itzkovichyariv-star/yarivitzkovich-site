/**
 * Scholar Self-Citation Collector
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this entire script into Chrome DevTools console while you are on:
 *   https://scholar.google.com/citations?user=HyN_EIgAAAAJ&hl=en&sortby=citations
 *
 * It will:
 *   1. Read all your papers from the profile page (clicking "Show more" first)
 *   2. For each paper that has citations, visit the "cited by" pages
 *   3. Collect the author line of every citing paper
 *   4. Flag any paper where "itzkovich" appears in the authors = self-citation
 *   5. POST the full dataset to your API
 *
 * Takes ~10–20 minutes depending on number of citations.
 * Do NOT close or navigate away from the tab while it's running.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_URL  = "https://yarivitzkovich.org/api/scholar-sync";
const QC_TOKEN = "494fc30488a603d7e8c7c9ce5ae27298f61420f47a9723ecb08cf46b57c076c1";
const OWNER    = "itzkovich";
const PAGE_SIZE = 10;

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randDelay(minMs = 2000, maxMs = 4500) {
  return sleep(Math.floor(Math.random() * (maxMs - minMs) + minMs));
}

function norm(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

// Fuzzy title match to get slug from site papers list
function matchSlug(title, slugMap) {
  const nt = norm(title);
  if (slugMap[nt]) return slugMap[nt];
  let best = 0, bslug = null;
  for (const [nt2, slug] of Object.entries(slugMap)) {
    // simple bigram overlap
    const score = similarity(nt, nt2);
    if (score > best) { best = score; bslug = slug; }
  }
  return best >= 0.72 ? bslug : null;
}

function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = s => {
    const bg = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.slice(i, i + 2);
      bg.set(bi, (bg.get(bi) || 0) + 1);
    }
    return bg;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let intersect = 0;
  for (const [k, v] of ba) intersect += Math.min(v, bb.get(k) || 0);
  return (2 * intersect) / (a.length - 1 + b.length - 1);
}

// Wait for a selector to appear in the DOM
function waitFor(sel, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (document.querySelector(sel)) return resolve(true);
    const obs = new MutationObserver(() => {
      if (document.querySelector(sel)) { obs.disconnect(); resolve(true); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(false); }, timeoutMs);
  });
}

// Navigate and wait for selector
async function goTo(url, waitSel, timeoutMs = 15000) {
  location.href = url;
  // poll until URL changes and selector appears
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(600);
    if (document.querySelector(waitSel)) return true;
  }
  return false;
}

// ── Step 1: expand profile and read papers ───────────────────────────────────

async function getProfilePapers() {
  console.log("📄 Expanding paper list …");

  // Click "Show more" until disabled
  while (true) {
    const btn = document.getElementById("gsc_bpf_more");
    if (!btn || !btn.offsetParent || btn.disabled) break;
    btn.click();
    await sleep(1500);
  }

  const rows = document.querySelectorAll("tr.gsc_a_tr");
  const papers = [];
  for (const row of rows) {
    try {
      const titleEl = row.querySelector(".gsc_a_at");
      const citeEl  = row.querySelector(".gsc_a_ac");
      if (!titleEl || !citeEl) continue;
      const title    = titleEl.textContent.trim();
      const countTxt = citeEl.textContent.trim();
      const count    = /^\d+$/.test(countTxt) ? parseInt(countTxt, 10) : 0;
      const href     = citeEl.getAttribute("href") || "";
      const m        = href.match(/cites=(\d+)/);
      const cites_id = m ? m[1] : null;
      papers.push({ title, count, cites_id });
    } catch (_) {}
  }
  console.log(`  Found ${papers.length} papers.`);
  return papers;
}

// ── Step 2: collect citing-paper authors for one paper ───────────────────────

async function getCitingAuthors(cites_id, total) {
  const allAuthors = [];
  const maxPages   = Math.min(Math.floor(total / PAGE_SIZE) + 2, 20);

  for (let page = 0; page < maxPages; page++) {
    const url = `https://scholar.google.com/scholar?cites=${cites_id}&hl=en&num=10&start=${page * PAGE_SIZE}`;
    const ok  = await goTo(url, ".gs_r.gs_or.gs_scl", 15000);
    if (!ok) break;
    await randDelay(1500, 3000);

    const results = document.querySelectorAll(".gs_r.gs_or.gs_scl");
    if (!results.length) break;

    for (const r of results) {
      const aEl = r.querySelector(".gs_a");
      allAuthors.push(aEl ? aEl.textContent.trim() : "");
    }

    process && process.stdout ? null : null; // no-op, just in case
    console.log(`    page ${page + 1}: ${results.length} results`);

    if (results.length < PAGE_SIZE) break;
    await randDelay(2000, 4000);
  }

  return allAuthors;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  // Make sure we're on the profile page
  if (!location.href.includes("scholar.google.com/citations")) {
    console.error("❌ Navigate to your Scholar profile page first, then paste this script.");
    return;
  }

  // Load slug map
  console.log("📦 Loading paper list from site …");
  let slugMap = {};
  try {
    const resp = await fetch("https://yarivitzkovich.org/papers-doi.json");
    const data = await resp.json();
    for (const p of data.papers) slugMap[norm(p.title)] = p.slug;
    console.log(`  ${Object.keys(slugMap).length} slugs loaded.`);
  } catch (e) {
    console.error("❌ Could not load papers-doi.json:", e);
    return;
  }

  // Read profile papers (must be on profile page)
  const profileUrl = "https://scholar.google.com/citations?user=HyN_EIgAAAAJ&hl=en&sortby=citations";
  if (!location.href.startsWith(profileUrl.split("?")[0])) {
    console.log("Navigating to profile …");
    await goTo(profileUrl, "tr.gsc_a_tr", 15000);
    await sleep(1500);
  }

  const papers  = await getProfilePapers();
  const results = [];

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const slug  = matchSlug(paper.title, slugMap);

    if (!slug) {
      console.log(`[${i+1}/${papers.length}] UNMATCHED: ${paper.title.slice(0, 60)}`);
      continue;
    }

    if (paper.count === 0 || !paper.cites_id) {
      results.push({ slug, citation_count: 0, self_citation_count: 0, citing_papers: [] });
      continue;
    }

    console.log(`\n[${i+1}/${papers.length}] ${paper.title.slice(0, 65)}`);
    console.log(`  ${paper.count} citations — fetching citing papers …`);

    const authorLines = await getCitingAuthors(paper.cites_id, paper.count);

    let self_count = 0;
    const citing_papers = authorLines.map(line => {
      const is_self = line.toLowerCase().includes(OWNER);
      if (is_self) self_count++;
      return { authors: line, is_self };
    });

    console.log(`  → ${paper.count} total | ${self_count} self | ${paper.count - self_count} external`);

    results.push({
      slug,
      citation_count:      paper.count,
      self_citation_count: self_count,
      citing_papers,
    });

    // Navigate back to profile to keep the session warm
    await goTo(profileUrl, "tr.gsc_a_tr", 15000);
    await sleep(1000);
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  console.log(`\n📤 POSTing ${results.length} papers to API …`);
  try {
    const resp = await fetch(API_URL, {
      method:  "POST",
      headers: { "content-type": "application/json", "x-qc-token": QC_TOKEN },
      body:    JSON.stringify({ source: "google_scholar_selfcite", papers: results }),
    });
    const text = await resp.text();
    console.log(`Response ${resp.status}: ${text.slice(0, 300)}`);
    if (resp.ok) {
      console.log("✅ Done! Self-citation data saved.");
    } else {
      console.error("❌ API error — see above.");
    }
  } catch (e) {
    console.error("❌ POST failed:", e);
  }

  const totalSelf  = results.reduce((s, p) => s + p.self_citation_count, 0);
  const totalCites = results.reduce((s, p) => s + p.citation_count, 0);
  console.log(`\nSummary: ${totalSelf} self-citations out of ${totalCites} total ` +
              `(${totalCites ? Math.round(totalSelf/totalCites*100) : 0}%)`);
})();
