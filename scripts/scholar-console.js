/**
 * Scholar Self-Citation Collector — v2 (fetch-based, no navigation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this entire script into Chrome DevTools console while you are on:
 *   https://scholar.google.com/citations?user=HyN_EIgAAAAJ&hl=en&sortby=citations
 *
 * It stays on the profile page the whole time and uses fetch() to read
 * the citing-paper pages in the background — no navigation, no CAPTCHA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_URL  = "https://yarivitzkovich.org/api/scholar-sync";
const QC_TOKEN = "494fc30488a603d7e8c7c9ce5ae27298f61420f47a9723ecb08cf46b57c076c1";
const OWNER    = "itzkovich";
const PAGE_SIZE = 10;

// ── On-page progress overlay ─────────────────────────────────────────────────
// A fixed box in the top-right corner so you can SEE what's happening without
// opening the console. Green = done, red = problem.
const UI = (() => {
  let box, msgEl, barEl;
  function ensure() {
    if (box) return;
    box = document.createElement("div");
    box.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;background:#7A1E2B;color:#F4EFE6;font:14px/1.5 -apple-system,system-ui,sans-serif;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:16px 18px;";
    box.innerHTML =
      '<div style="font-weight:600;font-size:15px;margin-bottom:6px">📊 Scholar Sync</div>' +
      '<div class="ss-msg" style="opacity:.92">Starting…</div>' +
      '<div style="height:5px;background:rgba(244,239,230,.25);border-radius:3px;margin-top:12px;overflow:hidden">' +
      '<div class="ss-bar" style="height:100%;width:0;background:#F4EFE6;transition:width .3s"></div></div>';
    (document.body || document.documentElement).appendChild(box);
    msgEl = box.querySelector(".ss-msg");
    barEl = box.querySelector(".ss-bar");
  }
  return {
    status(m, pct) { ensure(); msgEl.textContent = m; if (pct != null) barEl.style.width = Math.max(0, Math.min(100, pct)) + "%"; },
    done(m) { ensure(); box.style.background = "#1f6f3f"; msgEl.textContent = m; barEl.style.width = "100%"; },
    fail(m) { ensure(); box.style.background = "#8a1f1f"; msgEl.textContent = m; },
  };
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randDelay(lo = 1500, hi = 3500) {
  return sleep(Math.floor(Math.random() * (hi - lo) + lo));
}
function norm(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = s => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i+2); m.set(k, (m.get(k)||0)+1);
    }
    return m;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let x = 0;
  for (const [k,v] of ba) x += Math.min(v, bb.get(k)||0);
  return (2*x) / (a.length-1 + b.length-1);
}
function matchSlug(title, slugMap) {
  const nt = norm(title);
  if (slugMap[nt]) return slugMap[nt];
  let best = 0, bslug = null;
  for (const [k, slug] of Object.entries(slugMap)) {
    const sc = similarity(nt, k);
    if (sc > best) { best = sc; bslug = slug; }
  }
  return best >= 0.72 ? bslug : null;
}

// ── Expand profile and read all paper rows ────────────────────────────────────
async function getProfilePapers() {
  console.log("📄 Expanding paper list …");
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
      papers.push({ title, count, cites_id: m ? m[1] : null });
    } catch (_) {}
  }
  console.log(`  Found ${papers.length} papers.`);
  return papers;
}

// ── Fetch citing authors via background fetch (stays on profile page) ─────────
async function getCitingAuthors(cites_id, total) {
  const all = [];
  const maxPages = Math.min(Math.floor(total / PAGE_SIZE) + 2, 20);

  for (let page = 0; page < maxPages; page++) {
    const url = `https://scholar.google.com/scholar?cites=${cites_id}&hl=en&num=10&start=${page * PAGE_SIZE}`;
    let html = "";
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) { console.warn(`    fetch ${resp.status} on page ${page+1}`); break; }
      html = await resp.text();
    } catch (e) {
      console.warn(`    fetch error page ${page+1}:`, e); break;
    }

    // Parse the fetched HTML
    const doc   = new DOMParser().parseFromString(html, "text/html");
    const items = doc.querySelectorAll(".gs_r.gs_or.gs_scl");
    if (!items.length) break;

    for (const r of items) {
      const aEl = r.querySelector(".gs_a");
      all.push(aEl ? aEl.textContent.trim() : "");
    }
    console.log(`    page ${page+1}: ${items.length} results`);
    if (items.length < PAGE_SIZE) break;
    await randDelay();
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!location.href.includes("scholar.google.com/citations")) {
    UI.fail("Open your Google Scholar profile page first, then click the button again.");
    console.error("❌ Go to your Scholar profile page first, then run this.");
    return;
  }

  // Load slug map
  UI.status("Loading your paper list…", 3);
  console.log("📦 Loading paper list from site …");
  let slugMap = {};
  try {
    const resp = await fetch("https://yarivitzkovich.org/papers-doi.json");
    const data = await resp.json();
    for (const p of data.papers) slugMap[norm(p.title)] = p.slug;
    console.log(`  ${Object.keys(slugMap).length} slugs loaded.`);
  } catch (e) {
    UI.fail("Couldn't load your paper list. Check your connection and try again.");
    console.error("❌ Could not load papers-doi.json:", e); return;
  }

  UI.status("Reading your Scholar profile…", 6);
  const papers  = await getProfilePapers();
  const results = [];

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    UI.status(`Reading paper ${i + 1} of ${papers.length}…`, 8 + (i / papers.length) * 82);
    const slug  = matchSlug(paper.title, slugMap);

    if (!slug) {
      console.log(`[${i+1}/${papers.length}] UNMATCHED: ${paper.title.slice(0,60)}`);
      continue;
    }

    if (!paper.count || !paper.cites_id) {
      results.push({ slug, citation_count: paper.count || 0, self_citation_count: 0, citing_papers: [] });
      continue;
    }

    console.log(`\n[${i+1}/${papers.length}] ${paper.title.slice(0,65)}`);
    console.log(`  ${paper.count} citations — fetching …`);

    const authorLines = await getCitingAuthors(paper.cites_id, paper.count);
    let selfCount = 0;
    const citing_papers = authorLines.map(line => {
      const is_self = line.toLowerCase().includes(OWNER);
      if (is_self) selfCount++;
      return { authors: line, is_self };
    });

    console.log(`  → ${paper.count} total | ${selfCount} self | ${paper.count - selfCount} external`);
    results.push({ slug, citation_count: paper.count, self_citation_count: selfCount, citing_papers });
    await randDelay(1000, 2000);
  }

  const totalSelf  = results.reduce((s,p) => s + p.self_citation_count, 0);
  const totalCites = results.reduce((s,p) => s + p.citation_count, 0);

  // POST
  UI.status("Saving to your site…", 95);
  console.log(`\n📤 POSTing ${results.length} papers …`);
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-qc-token": QC_TOKEN },
      body: JSON.stringify({ source: "google_scholar_selfcite", papers: results }),
    });
    const txt = await resp.text();
    console.log(`Response ${resp.status}: ${txt.slice(0, 300)}`);
    if (resp.ok) {
      UI.done(`✅ Done — ${results.length} papers · ${totalCites} citations · ${totalSelf} self`);
      console.log("✅ Done! Self-citation data saved.");
    } else {
      UI.fail(`Saved request failed (${resp.status}). Check the console.`);
      console.error("❌ API error.");
    }
  } catch (e) {
    UI.fail("Couldn't reach your site to save. Check the console.");
    console.error("❌ POST failed:", e);
  }

  console.log(`\nSummary: ${totalSelf} self out of ${totalCites} total (${totalCites ? Math.round(totalSelf/totalCites*100) : 0}%)`);
})();
