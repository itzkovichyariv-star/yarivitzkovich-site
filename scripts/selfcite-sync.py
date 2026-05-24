#!/usr/bin/env python3
"""
Fetches citing-paper lists from Google Scholar for each of Yariv's publications
and detects self-citations (papers where Itzkovich is a co-author).

Runs from your Mac — NOT GitHub Actions (Scholar blocks shared IPs for this
volume of requests). Run monthly or whenever you want updated self-citation data.

Usage:
  python3 scripts/selfcite-sync.py <api_url> <qc_secret>

Example:
  python3 scripts/selfcite-sync.py \
    "https://yarivitzkovich.org/api/scholar-sync" \
    YOUR_QC_SECRET
"""

import re
import sys
import time
from difflib import SequenceMatcher

import requests
from scholarly import scholarly, ProxyGenerator

SCHOLAR_USER     = "HyN_EIgAAAAJ"
OWNER_FRAGMENT   = "itzkovich"
DELAY_BETWEEN    = 10   # seconds between each paper's citing-list fetch
MAX_CITING_PAGES = 15   # max pages per paper (10 results/page → up to 150 citing papers)


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 selfcite-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    # Load slug map
    print(f"Loading paper list from {doi_url} …")
    r = requests.get(doi_url, timeout=15)
    r.raise_for_status()
    site_papers = r.json()["papers"]
    slug_map = {norm(p["title"]): p["slug"] for p in site_papers}
    print(f"  {len(slug_map)} slugs loaded.")

    # Try free proxies for better Scholar reliability
    try:
        pg = ProxyGenerator()
        pg.FreeProxies()
        scholarly.use_proxy(pg)
        print("Free proxy rotation active.")
    except Exception as e:
        print(f"Proxy setup failed ({e}) — running direct.")

    # Fetch author profile to get publication list with cluster IDs
    print("\nFetching Scholar profile …")
    author = scholarly.search_author_id(SCHOLAR_USER)
    author = scholarly.fill(author, sections=["basics", "publications"])
    pubs   = author.get("publications", [])
    print(f"  {len(pubs)} publications found.")

    results = []  # { slug, citation_count, self_citation_count, citing_papers }

    for i, pub in enumerate(pubs):
        title      = pub.get("bib", {}).get("title", "")
        cite_count = pub.get("num_citations", 0) or 0

        # Match to a slug
        slug = None
        nt   = norm(title)
        if nt in slug_map:
            slug = slug_map[nt]
        else:
            best_score, best_slug = 0.0, None
            for norm_t, s in slug_map.items():
                score = SequenceMatcher(None, nt, norm_t).ratio()
                if score > best_score:
                    best_score, best_slug = score, s
            if best_score >= 0.72:
                slug = best_slug

        if not slug:
            print(f"  [{i+1}/{len(pubs)}] UNMATCHED: {title[:65]}")
            continue

        if cite_count == 0:
            print(f"  [{i+1}/{len(pubs)}] {slug[:50]}  [0 cites — skipping]")
            results.append({
                "slug":               slug,
                "citation_count":     0,
                "self_citation_count": 0,
                "citing_papers":      [],
            })
            continue

        print(f"\n  [{i+1}/{len(pubs)}] {title[:60]}  [{cite_count} cites]")
        print(f"    Fetching citing papers …", end="", flush=True)

        citing_papers = []
        self_count    = 0

        try:
            time.sleep(DELAY_BETWEEN)
            filled_pub = scholarly.fill(pub, sections=["citations"])
            page_count = 0
            for citing in scholarly.citedby(filled_pub):
                bib     = citing.get("bib", {})
                c_title = bib.get("title", "")
                c_year  = bib.get("pub_year", "") or bib.get("year", "")
                authors = bib.get("author", "") or ""  # "Smith, J and Jones, K"

                is_self = OWNER_FRAGMENT in authors.lower()
                if is_self:
                    self_count += 1

                citing_papers.append({
                    "title":   c_title,
                    "year":    str(c_year) if c_year else None,
                    "authors": authors,
                    "is_self": is_self,
                })

                page_count += 1
                if page_count >= MAX_CITING_PAGES * 10:
                    print(f" (capped at {page_count})", end="")
                    break

                if page_count % 10 == 0:
                    print(f" {page_count}…", end="", flush=True)
                    time.sleep(DELAY_BETWEEN)

        except Exception as e:
            print(f"\n    Error fetching citing papers: {e}")

        external = cite_count - self_count
        print(f"\n    → {cite_count} total | {self_count} self | {external} external")

        results.append({
            "slug":               slug,
            "citation_count":     cite_count,
            "self_citation_count": self_count,
            "citing_papers":      citing_papers,
        })

    # POST to /api/scholar-sync with full citing data
    payload = {
        "source":  "google_scholar_selfcite",
        "papers":  results,
    }

    print(f"\nPOSTing {len(results)} papers to {api_url} …")
    r = requests.post(
        api_url,
        json=payload,
        headers={"x-qc-token": qc_secret, "content-type": "application/json"},
        timeout=30,
    )
    print(f"Response {r.status_code}: {r.text[:300]}")
    if not r.ok:
        sys.exit(1)

    total_self = sum(p["self_citation_count"] for p in results)
    total_cites = sum(p["citation_count"] for p in results)
    print(f"\nDone. {total_self} self-citations out of {total_cites} total.")


if __name__ == "__main__":
    main()
