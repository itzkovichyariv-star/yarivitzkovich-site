#!/usr/bin/env python3
"""
Detects self-citations using CrossRef reference data.

For each of Yariv's papers that has a DOI, fetches its reference list from
the CrossRef API (free, no key needed), then checks whether any reference
matches another paper by Yariv. Those are self-citations.

No browser, no CAPTCHA, no rate limits.

Usage:
  python3 scripts/crossref-selfcite.py <api_url> <qc_secret>

Example:
  python3 scripts/crossref-selfcite.py \
    "https://yarivitzkovich.org/api/scholar-sync" \
    494fc30488a603d7e8c7c9ce5ae27298f61420f47a9723ecb08cf46b57c076c1
"""

import re
import sys
import time
import requests
from difflib import SequenceMatcher

OWNER_LAST   = "itzkovich"
CROSSREF_API = "https://api.crossref.org/works"
SITE_DOI_URL = "https://yarivitzkovich.org/papers-doi.json"
DELAY        = 1.0   # seconds between CrossRef requests (polite)

HEADERS = {
    "User-Agent": "YarivItzkovichSite/1.0 (mailto:itzkovichyariv@gmail.com)"
}


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def title_match(a, b, threshold=0.78):
    return SequenceMatcher(None, norm(a), norm(b)).ratio() >= threshold


def doi_match(doi_a, doi_b):
    """Case-insensitive DOI comparison, strip URL prefix."""
    def clean(d):
        return re.sub(r"https?://(dx\.)?doi\.org/", "", d or "").strip().lower()
    a, b = clean(doi_a), clean(doi_b)
    return bool(a and b and a == b)


def fetch_references(doi):
    """Return list of {doi, title, authors} from CrossRef for a given DOI."""
    url = f"{CROSSREF_API}/{requests.utils.quote(doi, safe='')}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json().get("message", {})
    except Exception as e:
        print(f"    CrossRef error for {doi}: {e}")
        return []

    raw_refs = data.get("reference", [])
    refs = []
    for ref in raw_refs:
        refs.append({
            "doi":     ref.get("DOI", ""),
            "title":   ref.get("article-title") or ref.get("volume-title") or "",
            "authors": ref.get("author", ""),
        })
    return refs


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 crossref-selfcite.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]

    # Load all papers from the site
    print(f"Loading papers from {SITE_DOI_URL} …")
    r = requests.get(SITE_DOI_URL, timeout=15)
    r.raise_for_status()
    site_papers = r.json()["papers"]
    print(f"  {len(site_papers)} papers loaded.")

    # Build lookup structures
    doi_to_slug  = {}
    title_to_slug = {}
    for p in site_papers:
        if p.get("doi"):
            doi_to_slug[p["doi"].strip().lower()] = p["slug"]
        title_to_slug[norm(p["title"])] = p["slug"]

    papers_with_doi = [p for p in site_papers if p.get("doi")]
    print(f"  {len(papers_with_doi)} papers have DOIs — will fetch references.\n")

    results = []

    for i, paper in enumerate(site_papers):
        slug  = paper["slug"]
        doi   = paper.get("doi", "").strip()
        title = paper["title"]

        if not doi:
            print(f"[{i+1}/{len(site_papers)}] {title[:55]}  [no DOI — skip]")
            results.append({
                "slug": slug, "citation_count": 0,
                "self_citation_count": 0, "citing_papers": [],
            })
            continue

        print(f"[{i+1}/{len(site_papers)}] {title[:60]}")

        refs = fetch_references(doi)
        print(f"  {len(refs)} references found in CrossRef")

        self_papers = []
        for ref in refs:
            ref_doi   = re.sub(r"https?://(dx\.)?doi\.org/", "", ref["doi"]).strip().lower()
            ref_title = ref["title"]

            # Check by DOI first
            matched_slug = None
            if ref_doi and ref_doi in doi_to_slug and doi_to_slug[ref_doi] != slug:
                matched_slug = doi_to_slug[ref_doi]

            # Fallback: fuzzy title match
            if not matched_slug and ref_title:
                nt = norm(ref_title)
                for nt2, s2 in title_to_slug.items():
                    if s2 != slug and title_match(nt, nt2):
                        matched_slug = s2
                        break

            if matched_slug:
                cited_title = next(
                    (p["title"] for p in site_papers if p["slug"] == matched_slug), matched_slug
                )
                self_papers.append({
                    "authors": f"Itzkovich Y et al. → cites: {cited_title[:60]}",
                    "is_self":  True,
                })
                print(f"    ✓ self-cite found: {cited_title[:60]}")

        print(f"  → {len(self_papers)} self-citations detected")

        # We only know self-citations here, not total citation_count.
        # Send null so the API's COALESCE preserves Scholar's existing count.
        results.append({
            "slug":                slug,
            "citation_count":      None,   # API will COALESCE with existing Scholar count
            "self_citation_count": len(self_papers),
            "citing_papers":       self_papers,
        })

        time.sleep(DELAY)

    # POST
    total_self = sum(p["self_citation_count"] for p in results)
    print(f"\nTotal self-citations found: {total_self}")
    print(f"POSTing {len(results)} papers to {api_url} …")

    r = requests.post(
        api_url,
        json={"source": "google_scholar_selfcite", "papers": results},
        headers={"x-qc-token": qc_secret, "content-type": "application/json"},
        timeout=30,
    )
    print(f"Response {r.status_code}: {r.text[:300]}")
    if r.ok:
        print(f"\n✅ Done. {total_self} self-citations stored.")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
