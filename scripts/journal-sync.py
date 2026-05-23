#!/usr/bin/env python3
"""
Fetches Journal Citation Reports (JCR) metrics from the Clarivate
Web of Science Journals API for every venue in the publications collection
and posts results to /api/journal-sync which stores them in D1.

Metrics per journal: Impact Factor (JIF), best JCR quartile (Q1–Q4).

Requires env var CLARIVATE_API_KEY — get yours at developer.clarivate.com
using your institutional Web of Science credentials. JCR updates once a year
(June), so this sync runs on an annual schedule (July 1).

Usage (called by GitHub Actions annual-journal-sync.yml):
  python scripts/journal-sync.py <api_url> <qc_secret>
"""

import os
import re
import sys
import time

import requests

WOS_JOURNALS_API = "https://api.clarivate.com/apis/wos-journals/v1"
DELAY            = 1   # second between API calls


def norm(s):
    return re.sub(r"\s+", " ", s.lower().strip())


def best_quartile(categories):
    """Return the best (lowest-numbered) quartile across all WOS categories."""
    qs = []
    for cat in (categories or []):
        q = cat.get("quartile") or cat.get("jcrQuartile") or ""
        m = re.search(r"Q([1-4])", str(q))
        if m:
            qs.append(int(m.group(1)))
    return f"Q{min(qs)}" if qs else None


def fetch_jcr(journal_name, api_key):
    headers = {
        "X-ApiKey": api_key,
        "Accept": "application/json",
        "User-Agent": "yarivitzkovich-site/1.0 journal-sync",
    }
    try:
        # Search by title — returns ranked matches
        r = requests.get(
            f"{WOS_JOURNALS_API}/journals",
            params={"q": journal_name, "limit": 5},
            headers=headers,
            timeout=20,
        )
        if r.status_code == 401:
            sys.exit("ERROR: CLARIVATE_API_KEY is invalid or expired.")
        if r.status_code == 403:
            sys.exit("ERROR: API key does not have access to the WOS Journals API.")
        if r.status_code == 404 or not r.text.strip():
            return None
        r.raise_for_status()

        # Log raw response for the first call so we can verify field names
        data = r.json()
        hits = data.get("hits") or data.get("journals") or []
        if not hits:
            return None

        # DEBUG: print first result structure so field names can be verified
        print(f"  [DEBUG first hit keys: {list(hits[0].keys())}]")

        # Pick the closest title match
        nt = norm(journal_name)
        best = None
        best_score = 0
        for hit in hits:
            hit_title = norm(hit.get("name") or hit.get("title") or "")
            # Simple word-overlap score
            words_a = set(nt.split())
            words_b = set(hit_title.split())
            score = len(words_a & words_b) / max(len(words_a | words_b), 1)
            if score > best_score:
                best_score, best = score, hit

        if best is None or best_score < 0.5:
            print(f"  No confident match (best score {best_score:.2f})")
            return None

        print(f"  Matched: {best.get('name') or best.get('title')} (score {best_score:.2f})")

        # Extract Impact Factor — field name varies by API version
        metrics = best.get("metrics") or best.get("jcrData") or {}
        impact_factor = None
        for key in ("impactFactor", "impact_factor", "twoYearImpactFactor"):
            val = metrics.get(key)
            if isinstance(val, dict):
                val = val.get("value") or val.get("current")
            if val is not None:
                try:
                    impact_factor = float(val)
                    break
                except (TypeError, ValueError):
                    pass

        # Extract quartile — field name varies by API version
        categories = (
            best.get("categories") or
            best.get("ranks") or
            (metrics.get("categories") if isinstance(metrics, dict) else None) or
            []
        )
        quartile = best_quartile(categories)

        return {
            "journal_name":  journal_name,
            "impact_factor": impact_factor,
            "jcr_quartile":  quartile,
        }

    except SystemExit:
        raise
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python journal-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    api_key = os.environ.get("CLARIVATE_API_KEY", "")
    if not api_key:
        sys.exit("ERROR: CLARIVATE_API_KEY environment variable is not set.\n"
                 "Get your key at developer.clarivate.com under Web of Science Journals API.")

    print(f"Loading papers from {doi_url} …")
    try:
        r = requests.get(doi_url, timeout=15)
        r.raise_for_status()
        site_papers = r.json()["papers"]
    except Exception as e:
        sys.exit(f"Failed to load papers-doi.json: {e}")

    # Collect unique venues, skip empty / book-only entries
    seen, venues = set(), {}
    for p in site_papers:
        v = (p.get("venue") or "").strip()
        if not v:
            continue
        key = norm(v)
        if key not in seen:
            seen.add(key)
            venues[key] = v

    print(f"Found {len(venues)} unique venues to look up in JCR.")

    results = []
    for key, name in venues.items():
        print(f"\nJCR lookup: {name[:70]}")
        time.sleep(DELAY)
        metrics = fetch_jcr(name, api_key)
        if metrics:
            results.append({"journal_key": key, **metrics})
            q  = metrics.get("jcr_quartile") or "?"
            if_ = metrics.get("impact_factor")
            print(f"  → {q} | IF {if_:.3f}" if if_ else f"  → {q} | IF n/a")
        else:
            print("  → Not found in JCR")

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
