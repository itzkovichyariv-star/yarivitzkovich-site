#!/usr/bin/env python3
"""
Fetches journal metrics from Scimago for every venue in the publications
collection and posts them to /api/journal-sync which stores results in D1.

Metrics returned per journal: SJR score, best quartile (Q1–Q4), h-index.
Quartile is extracted from Scimago's "Categories" string (e.g. "Q1").

Usage (called by GitHub Actions monthly-journal-sync.yml):
  python scripts/journal-sync.py <api_url> <qc_secret>
"""

import re
import sys
import time

import requests

SCIMAGO_SEARCH = "https://www.scimagojr.com/journalsearch.php"
DELAY          = 3   # seconds between Scimago requests (be polite)


def norm(s):
    return re.sub(r"\s+", " ", s.lower().strip())


def best_quartile(categories_str):
    """Extract the best (lowest-numbered) quartile from a categories string."""
    qs = re.findall(r'Q([1-4])', categories_str or '')
    return f"Q{min(int(q) for q in qs)}" if qs else None


def fetch_scimago(venue_name):
    try:
        r = requests.get(
            SCIMAGO_SEARCH,
            params={"q": venue_name, "type": "j", "out": "json"},
            timeout=20,
            headers={"User-Agent": "yarivitzkovich-site/1.0 journal-sync"},
        )
        if r.status_code == 404 or not r.text.strip():
            return None
        r.raise_for_status()
        data = r.json()
        if not data:
            return None
        j = data[0]
        return {
            "journal_name": venue_name,
            "sjr":          float(j.get("SJR") or j.get("sjr") or 0) or None,
            "best_quartile": best_quartile(str(j.get("Categories") or j.get("categories") or "")),
            "h_index":      int(j.get("H index") or j.get("h_index") or 0) or None,
        }
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python journal-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    print(f"Loading papers from {doi_url} …")
    try:
        r = requests.get(doi_url, timeout=15)
        r.raise_for_status()
        site_papers = r.json()["papers"]
    except Exception as e:
        sys.exit(f"Failed to load papers-doi.json: {e}")

    # Collect unique venues (skip nulls and book chapters/books)
    seen, venues = set(), {}
    for p in site_papers:
        v = (p.get("venue") or "").strip()
        if not v:
            continue
        key = norm(v)
        if key not in seen:
            seen.add(key)
            venues[key] = v

    print(f"Found {len(venues)} unique venues to look up.")

    results = []
    for key, name in venues.items():
        print(f"\nScimago: {name[:70]}")
        time.sleep(DELAY)
        metrics = fetch_scimago(name)
        if metrics:
            results.append({"journal_key": key, **metrics})
            q   = metrics.get("best_quartile") or "?"
            sjr = metrics.get("sjr") or "?"
            h   = metrics.get("h_index") or "?"
            print(f"  → {q} | SJR {sjr} | h-index {h}")
        else:
            print("  → Not found on Scimago")

    print(f"\nPOSTing {len(results)} journals to {api_url} …")
    try:
        r = requests.post(
            api_url,
            json={"journals": results},
            headers={"x-qc-token": qc_secret, "content-type": "application/json"},
            timeout=30,
        )
        print(f"Response {r.status_code}: {r.text[:400]}")
        if not r.ok:
            sys.exit(1)
    except Exception as e:
        sys.exit(f"POST failed: {e}")

    print(f"\nDone: {len(results)} journals stored.")


if __name__ == "__main__":
    main()
