#!/usr/bin/env python3
"""
Fetches citation data from Yariv Itzkovich's Google Scholar profile and
posts it to /api/scholar-sync on yarivitzkovich.org.

Uses the `scholarly` package which handles Google Scholar's anti-bot
measures better than raw requests. Set SCRAPER_API_KEY env var to use
ScraperAPI as a proxy if scholarly alone is still blocked.

Usage (called by GitHub Actions daily-scholar-sync.yml):
  python scripts/scholar-sync.py <api_url> <qc_secret>
"""

import os
import re
import sys
from difflib import SequenceMatcher

import requests
from scholarly import scholarly, ProxyGenerator

SCHOLAR_USER    = "HyN_EIgAAAAJ"
OWNER_NAME      = "itzkovich"
MATCH_THRESHOLD = 0.72
MAX_CITING      = 50


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def match_slug(gs_title, slug_map):
    nt = norm(gs_title)
    if nt in slug_map:
        return slug_map[nt]
    best_slug, best_score = None, 0.0
    for norm_title, slug in slug_map.items():
        score = similarity(nt, norm_title)
        if score > best_score:
            best_score, best_slug = score, slug
    return best_slug if best_score >= MATCH_THRESHOLD else None


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python scholar-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    # Optional: use ScraperAPI as proxy (set SCRAPER_API_KEY secret in GitHub)
    scraper_key = os.environ.get("SCRAPER_API_KEY", "")
    if scraper_key:
        print("Using ScraperAPI proxy …")
        pg = ProxyGenerator()
        pg.ScraperAPI(scraper_key)
        scholarly.use_proxy(pg)
    else:
        print("No proxy configured — relying on scholarly defaults.")

    # Load slug map from the live site
    print(f"Loading paper list from {doi_url} …")
    try:
        r = requests.get(doi_url, timeout=15)
        r.raise_for_status()
        site_papers = r.json()["papers"]
    except Exception as e:
        sys.exit(f"Failed to load papers-doi.json: {e}")

    slug_map = {norm(p["title"]): p["slug"] for p in site_papers}
    print(f"  {len(slug_map)} slugs loaded.")

    # Fetch author profile via scholarly
    print("Fetching Scholar profile …")
    try:
        author = scholarly.search_author_id(SCHOLAR_USER)
        author = scholarly.fill(author, sections=["basics", "counts", "publications"])
    except Exception as e:
        sys.exit(f"Failed to fetch Scholar profile: {e}")

    # scholarly's "5y" window = since 2021 (2026 − 5 = 2021)
    metrics = {
        "citations":       author.get("citedby", 0),
        "h_index":         author.get("hindex", 0),
        "i10_index":       author.get("i10index", 0),
        "citations_since": author.get("citedby5y", 0),
        "h_index_since":   author.get("hindex5y", 0),
        "i10_index_since": author.get("i10index5y", 0),
    }
    print(
        f"Profile: {metrics['citations']} citations | "
        f"h-index {metrics['h_index']} | i10 {metrics['i10_index']}"
    )

    matched, unmatched = [], []
    for pub in author.get("publications", []):
        title      = pub.get("bib", {}).get("title", "")
        cite_count = pub.get("num_citations", 0)

        slug = match_slug(title, slug_map)
        if not slug:
            unmatched.append(title)
            print(f"  UNMATCHED: {title[:70]}")
            continue

        print(f"\n• {title[:65]}")
        print(f"  slug={slug}  citations={cite_count}")

        citing     = []
        self_count = 0
        if cite_count > 0:
            try:
                pub_filled = scholarly.fill(pub)
                for cp in scholarly.citedby(pub_filled):
                    authors_str = cp.get("bib", {}).get("author", "")
                    year        = str(cp.get("bib", {}).get("pub_year", ""))
                    is_self     = OWNER_NAME in authors_str.lower()
                    citing.append({
                        "title":   cp.get("bib", {}).get("title", ""),
                        "authors": authors_str,
                        "year":    year,
                        "is_self": is_self,
                    })
                    if is_self:
                        self_count += 1
                    if len(citing) >= MAX_CITING:
                        break
                print(f"  {len(citing)} citing papers fetched, {self_count} self-citations")
            except Exception as e:
                print(f"  Warning: citing papers unavailable — {e}")

        matched.append({
            "slug":                slug,
            "citation_count":      cite_count,
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
        print("Unmatched titles (not in publications collection):")
        for t in unmatched:
            print(f"  - {t}")


if __name__ == "__main__":
    main()
