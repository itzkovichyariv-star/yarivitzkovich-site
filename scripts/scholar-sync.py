#!/usr/bin/env python3
"""
Fetches citation data from Yariv Itzkovich's Google Scholar profile and
posts it to /api/scholar-sync on yarivitzkovich.org.

For each paper it:
  1. Records the total citation count from the profile page
  2. Fetches the citing papers list (up to 50 per paper)
  3. Detects self-citations (any citing paper whose author string contains
     OWNER_NAME, case-insensitive)
  4. Matches the Scholar title to a publication slug using fuzzy matching
     against /papers-doi.json (generated at build time)

Usage (called by GitHub Actions daily-scholar-sync.yml):
  python scripts/scholar-sync.py <api_url> <qc_secret>
"""

import json
import re
import sys
import time
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup

SCHOLAR_USER     = "HyN_EIgAAAAJ"
SCHOLAR_BASE     = "https://scholar.google.com"
OWNER_NAME       = "itzkovich"
PAGE_DELAY       = 5     # seconds between Scholar requests
MAX_CITING_PAGES = 5     # cap at 50 citing papers per paper (5 pages × 10)
MATCH_THRESHOLD  = 0.72  # minimum similarity score to accept a slug match

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def fetch_html(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 429:
                wait = 60 * (attempt + 1)
                print(f"  Rate-limited — waiting {wait}s …")
                time.sleep(wait)
                continue
            if r.status_code != 200:
                print(f"  HTTP {r.status_code}: {url}")
                return None
            return r.text
        except Exception as e:
            print(f"  Fetch error (attempt {attempt + 1}): {e}")
            time.sleep(10)
    return None


def norm(s):
    """Normalise a title for comparison: lowercase, strip punctuation."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def match_slug(gs_title, slug_map):
    """Return the best-matching slug, or None if below MATCH_THRESHOLD."""
    nt = norm(gs_title)
    if nt in slug_map:
        return slug_map[nt]
    best_slug, best_score = None, 0.0
    for norm_title, slug in slug_map.items():
        score = similarity(nt, norm_title)
        if score > best_score:
            best_score, best_slug = score, slug
    return best_slug if best_score >= MATCH_THRESHOLD else None


# ── Scholar scraping ──────────────────────────────────────────────────────────

def fetch_profile():
    url = f"{SCHOLAR_BASE}/citations?user={SCHOLAR_USER}&hl=en&pagesize=100"
    print(f"Fetching profile …")
    html = fetch_html(url)
    if not html:
        return None, []

    soup = BeautifulSoup(html, "html.parser")

    # Overall metrics table: Citations | h-index | i10-index, each "All / Since 2021"
    metrics = {}
    keys = [("citations", "citations_since"), ("h_index", "h_index_since"), ("i10_index", "i10_index_since")]
    for i, row in enumerate(soup.select("table#gsc_rsb_st tbody tr")[:3]):
        cells = row.select("td.gsc_rsb_std")
        if len(cells) >= 2:
            ka, ks = keys[i]
            try:
                metrics[ka] = int(cells[0].text.strip() or 0)
                metrics[ks] = int(cells[1].text.strip() or 0)
            except ValueError:
                pass

    # Paper rows
    papers = []
    for row in soup.select("tr.gsc_a_tr"):
        title_el = row.select_one("a.gsc_a_at")
        cites_el = row.select_one("a.gsc_a_ac")
        year_el  = row.select_one("span.gsc_a_hc")
        if not title_el:
            continue

        title      = title_el.text.strip()
        cite_count = 0
        cites_id   = None

        if cites_el:
            txt = cites_el.text.strip()
            if txt.isdigit():
                cite_count = int(txt)
            href = cites_el.get("href", "")
            m = re.search(r"cites=([^&]+)", href)
            if m:
                cites_id = m.group(1)

        papers.append({
            "title":          title,
            "year":           year_el.text.strip() if year_el else "",
            "citation_count": cite_count,
            "cites_id":       cites_id,
        })

    return metrics, papers


def fetch_citing(cites_id, expected_count):
    """Return a list of citing-paper dicts (up to MAX_CITING_PAGES * 10)."""
    if not cites_id or expected_count == 0:
        return []

    citing = []
    for page in range(MAX_CITING_PAGES):
        start = page * 10
        url   = f"{SCHOLAR_BASE}/scholar?cites={cites_id}&hl=en&start={start}"
        time.sleep(PAGE_DELAY)
        html = fetch_html(url)
        if not html:
            break

        soup    = BeautifulSoup(html, "html.parser")
        results = soup.select("div.gs_r.gs_or.gs_scl")
        if not results:
            break

        for res in results:
            title_el = res.select_one("h3.gs_rt")
            meta_el  = res.select_one("div.gs_a")

            # Clean title
            title = ""
            if title_el:
                for tag in title_el.select("span, b.gs_ctu"):
                    tag.decompose()
                title = re.sub(r"\[(PDF|HTML|BOOK|CITATION)\]", "", title_el.get_text()).strip()

            authors_str, year = "", ""
            if meta_el:
                raw     = meta_el.get_text(strip=True)
                parts   = raw.split(" - ")
                authors_str = parts[0] if parts else raw
                ym = re.search(r"\b(19|20)\d{2}\b", raw)
                if ym:
                    year = ym.group(0)

            is_self = OWNER_NAME in authors_str.lower()
            citing.append({"title": title, "authors": authors_str, "year": year, "is_self": is_self})

    return citing


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python scholar-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    # Load slug map
    print(f"Loading paper list from {doi_url} …")
    try:
        r = requests.get(doi_url, timeout=15)
        r.raise_for_status()
        site_papers = r.json()["papers"]
    except Exception as e:
        sys.exit(f"Failed to load papers-doi.json: {e}")

    slug_map = {norm(p["title"]): p["slug"] for p in site_papers}
    print(f"  {len(slug_map)} slugs loaded.")

    # Fetch Scholar profile
    metrics, gs_papers = fetch_profile()
    if not gs_papers:
        sys.exit("Failed to fetch Scholar profile.")

    print(f"Profile: {len(gs_papers)} papers | "
          f"{metrics.get('citations', '?')} citations | "
          f"h-index {metrics.get('h_index', '?')} | "
          f"i10 {metrics.get('i10_index', '?')}")

    # Match slugs and fetch citing papers
    matched, unmatched = [], []
    for p in gs_papers:
        slug = match_slug(p["title"], slug_map)
        if not slug:
            unmatched.append(p["title"])
            print(f"  UNMATCHED: {p['title'][:70]}")
            continue

        print(f"\n• {p['title'][:65]}")
        print(f"  slug={slug}  citations={p['citation_count']}")

        citing     = []
        self_count = 0
        if p["citation_count"] > 0 and p["cites_id"]:
            citing     = fetch_citing(p["cites_id"], p["citation_count"])
            self_count = sum(1 for c in citing if c["is_self"])
            print(f"  {len(citing)} citing papers fetched, {self_count} self-citations")

        matched.append({
            "slug":                slug,
            "citation_count":      p["citation_count"],
            "self_citation_count": self_count,
            "citing_papers":       citing,
        })

    # POST to API
    payload = {"source": "google_scholar", "metrics": metrics, "papers": matched}
    print(f"\nPOSTing {len(matched)} papers to {api_url} …")
    try:
        r = requests.post(
            api_url,
            json=payload,
            headers={"x-qc-token": qc_secret, "content-type": "application/json"},
            timeout=30,
        )
        print(f"Response {r.status_code}: {r.text[:400]}")
        if not r.ok:
            sys.exit(1)
    except Exception as e:
        sys.exit(f"POST failed: {e}")

    print(f"\nFinished: {len(matched)} matched, {len(unmatched)} unmatched.")
    if unmatched:
        print("Unmatched (not in publications collection):")
        for t in unmatched:
            print(f"  - {t}")


if __name__ == "__main__":
    main()
