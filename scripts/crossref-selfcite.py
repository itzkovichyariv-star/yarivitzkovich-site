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
    "<your-sync-token>"
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


def fetch_references_by_doi(doi):
    """Return (resolved_doi, refs[]) from CrossRef for a given DOI."""
    url = f"{CROSSREF_API}/{requests.utils.quote(doi, safe='')}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json().get("message", {})
    except Exception as e:
        print(f"    CrossRef error for {doi}: {e}")
        return doi, []
    return doi, _parse_refs(data)


def search_crossref_by_title(title):
    """Search CrossRef by title; return (doi, refs[]) for the best match, or (None, [])."""
    params = {
        "query.bibliographic": title,
        "rows": 5,
        "select": "DOI,title,reference",
    }
    try:
        r = requests.get(CROSSREF_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        items = r.json().get("message", {}).get("items", [])
    except Exception as e:
        print(f"    CrossRef search error: {e}")
        return None, []

    for item in items:
        cr_titles = item.get("title") or []
        cr_title  = cr_titles[0] if cr_titles else ""
        if title_match(title, cr_title, threshold=0.80):
            doi = item.get("DOI", "")
            print(f"    CrossRef title match: {cr_title[:60]}")
            return doi, _parse_refs(item)

    return None, []


def _parse_refs(data):
    refs = []
    for ref in data.get("reference", []):
        refs.append({
            "doi":   ref.get("DOI", ""),
            "title": ref.get("article-title") or ref.get("volume-title") or "",
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
    print(f"  {len(papers_with_doi)} papers have DOIs; others will be searched by title.\n")

    # self_counts[slug]    = how many of Yariv's OTHER papers cite this paper
    # citing_map[slug]     = list of citing-paper descriptions
    # no_crossref_data     = slugs of Yariv's papers whose reference lists
    #                        were NOT found in CrossRef (so their self-refs
    #                        to other papers are invisible to us)
    self_counts      = {p["slug"]: 0 for p in site_papers}
    citing_map       = {p["slug"]: [] for p in site_papers}
    no_crossref_data = []   # papers where we got 0 refs from CrossRef

    for i, paper in enumerate(site_papers):
        slug  = paper["slug"]
        doi   = (paper.get("doi") or "").strip()
        title = paper["title"]

        print(f"[{i+1}/{len(site_papers)}] {title[:60]}")

        if doi:
            _, refs = fetch_references_by_doi(doi)
        else:
            print(f"  No DOI — searching CrossRef by title …")
            found_doi, refs = search_crossref_by_title(title)
            if found_doi:
                doi_to_slug[found_doi.strip().lower()] = slug

        if not refs:
            print(f"  ⚠ No reference data in CrossRef — self-cites from this paper undetectable")
            no_crossref_data.append(slug)
            time.sleep(DELAY)
            continue

        print(f"  {len(refs)} references in CrossRef", end="")

        found = 0
        for ref in refs:
            ref_doi   = re.sub(r"https?://(dx\.)?doi\.org/", "", ref["doi"]).strip().lower()
            ref_title = ref["title"]

            cited_slug = None
            if ref_doi and ref_doi in doi_to_slug and doi_to_slug[ref_doi] != slug:
                cited_slug = doi_to_slug[ref_doi]
            if not cited_slug and ref_title:
                nt = norm(ref_title)
                for nt2, s2 in title_to_slug.items():
                    if s2 != slug and title_match(nt, nt2):
                        cited_slug = s2
                        break

            if cited_slug:
                self_counts[cited_slug] += 1
                citing_map[cited_slug].append({
                    "authors": f"Itzkovich Y et al. (in: {title[:55]})",
                    "is_self":  True,
                })
                found += 1

        if found:
            print(f"  — {found} self-ref(s) found")
        else:
            print()

        time.sleep(DELAY)

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("SELF-CITATION SUMMARY")
    print("=" * 65)

    confirmed_zero = []
    uncertain_zero = []

    for paper in site_papers:
        slug = paper["slug"]
        sc   = self_counts[slug]
        if sc > 0:
            print(f"  ✓ {paper['title'][:55]:55s}  cited {sc}x")
        else:
            # Is this zero uncertain? — if any paper with no CrossRef data
            # MIGHT have cited this paper, we can't be sure.
            # (All papers without CrossRef data are potentially uncertain
            #  for every other paper, but that's too broad. We flag it
            #  as uncertain only when ≥1 paper has no CrossRef data at all.)
            if no_crossref_data:
                uncertain_zero.append(paper["title"])
            else:
                confirmed_zero.append(paper["title"])

    if no_crossref_data:
        print(f"\n⚠  {len(no_crossref_data)} of your papers had NO reference data in CrossRef:")
        for s in no_crossref_data:
            t = next((p["title"] for p in site_papers if p["slug"] == s), s)
            print(f"    • {t[:65]}")
        print(f"\n   Self-citations FROM these papers are not counted.")
        print(f"   Papers showing 0 may have missed self-cites from the above.")

    print(f"\nTotal self-citations detected: {sum(self_counts.values())}")
    print("=" * 65)

    # Build results
    results = []
    for paper in site_papers:
        slug = paper["slug"]
        results.append({
            "slug":                slug,
            "self_citation_count": self_counts[slug],
            "citing_papers":       citing_map[slug],
        })

    # POST
    total_self = sum(p["self_citation_count"] for p in results)
    print(f"\nTotal self-citations found: {total_self}")
    print(f"POSTing {len(results)} papers to {api_url} …")

    r = requests.post(
        api_url,
        json={"source": "crossref_selfcite", "papers": results},
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
