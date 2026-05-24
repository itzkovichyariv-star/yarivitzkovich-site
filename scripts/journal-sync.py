#!/usr/bin/env python3
"""
Fetches JCR Impact Factor and quartile for every journal in the publications
collection by browsing letpub.com — a free public aggregator of Journal Citation
Reports data widely used by researchers to check IF before submitting papers.

No API key required. Uses requests + BeautifulSoup (same as Scholar scraping).
Runs annually (July 1) after Clarivate publishes updated JCR data each June.

Usage (called by GitHub Actions annual-journal-sync.yml):
  python scripts/journal-sync.py <api_url> <qc_secret>
"""

import re
import sys
import time

import requests
from bs4 import BeautifulSoup

LETPUB_SEARCH = (
    "https://www.letpub.com.cn/index.php"
    "?page=journalapp&action=search"
    "&searchname={name}&searchissn=&searchfield="
    "&searchimpactlow=&searchimpacthigh=&searchscitype=&submit=Search"
)
DELAY = 3  # seconds between requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.letpub.com.cn/index.php?page=journalapp",
}


def norm(s):
    return re.sub(r"\s+", " ", s.lower().strip())


def word_overlap(a, b):
    wa, wb = set(norm(a).split()), set(norm(b).split())
    return len(wa & wb) / max(len(wa | wb), 1)


def best_quartile(qs):
    """Return the best (lowest-numbered) quartile from a list like ['Q1','Q3']."""
    nums = [int(m.group(1)) for q in qs for m in [re.search(r"Q([1-4])", q)] if m]
    return f"Q{min(nums)}" if nums else None


def fetch_letpub(journal_name):
    url = LETPUB_SEARCH.format(name=requests.utils.quote(journal_name))
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"  HTTP {r.status_code}")
            return None
        soup = BeautifulSoup(r.text, "html.parser")

        # LetPub returns a results table; each row is one journal
        table = soup.find("table", {"id": "MainContent_GridView1"}) or \
                soup.find("table", class_=re.compile(r"(result|journal)", re.I))

        if not table:
            # Fallback: find any table with IF-like content
            tables = soup.find_all("table")
            for t in tables:
                if "Impact Factor" in t.get_text() or "IF" in t.get_text():
                    table = t
                    break

        if not table:
            print("  No results table found — dumping page snippet for debug:")
            print(r.text[:500])
            return None

        rows = table.find_all("tr")
        # First row is header
        if len(rows) < 2:
            print("  No journal rows in table.")
            return None

        # Parse header to find column indices
        headers = [th.get_text(strip=True).lower() for th in rows[0].find_all(["th", "td"])]
        print(f"  Table headers: {headers}")

        def col(name_fragment):
            for i, h in enumerate(headers):
                if name_fragment in h:
                    return i
            return None

        name_col  = col("name") or col("journal") or 0
        if_col    = col("impact") or col("if") or col("factor")
        quart_col = col("quart") or col("jcr")

        best_row, best_score = None, 0.0
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) <= max(filter(None, [name_col, if_col, quart_col]), default=0):
                continue
            row_name  = cells[name_col].get_text(strip=True) if name_col is not None else ""
            score     = word_overlap(journal_name, row_name)
            if score > best_score:
                best_score, best_row = score, cells

        if best_row is None or best_score < 0.4:
            print(f"  No confident match (best score {best_score:.2f})")
            return None

        row_name = best_row[name_col].get_text(strip=True) if name_col is not None else ""
        print(f"  Matched: {row_name} (score {best_score:.2f})")

        # Extract Impact Factor
        impact_factor = None
        if if_col is not None and if_col < len(best_row):
            raw = best_row[if_col].get_text(strip=True).replace(",", ".")
            m = re.search(r"[\d]+\.[\d]+", raw)
            if m:
                try:
                    impact_factor = float(m.group())
                except ValueError:
                    pass

        # Extract quartile(s) — may appear in one or multiple cells
        quartiles = []
        if quart_col is not None and quart_col < len(best_row):
            text = best_row[quart_col].get_text(strip=True)
            quartiles = re.findall(r"Q[1-4]", text)
        # Also scan all cells for Qx tags in case quartile is embedded elsewhere
        if not quartiles:
            for cell in best_row:
                found = re.findall(r"Q[1-4]", cell.get_text(strip=True))
                quartiles.extend(found)

        jcr_quartile = best_quartile(quartiles)

        return {
            "journal_name":  journal_name,
            "impact_factor": impact_factor,
            "jcr_quartile":  jcr_quartile,
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

    # Collect unique venues
    seen, venues = set(), {}
    for p in site_papers:
        v = (p.get("venue") or "").strip()
        if not v:
            continue
        key = norm(v)
        if key not in seen:
            seen.add(key)
            venues[key] = v

    print(f"Found {len(venues)} unique venues to look up on LetPub / JCR.")

    results = []
    for key, name in venues.items():
        print(f"\nLooking up: {name[:70]}")
        time.sleep(DELAY)
        metrics = fetch_letpub(name)
        if metrics:
            results.append({"journal_key": key, **metrics})
            q   = metrics.get("jcr_quartile") or "?"
            if_ = metrics.get("impact_factor")
            print(f"  → {q} | IF {if_:.3f}" if if_ else f"  → {q} | IF n/a")
        else:
            print("  → Not found")

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
