#!/usr/bin/env python3
"""
Collects citing-paper data from Google Scholar via a real Chrome browser
(Selenium) and detects self-citations (papers where Itzkovich is an author).

Uses a real Chrome session — not the scholarly library — so Scholar's
rate limits and IP blocks do not apply.

Usage:
  python3 scripts/scholar-citing-sync.py <api_url> <qc_secret>

Example:
  python3 scripts/scholar-citing-sync.py \
    "https://yarivitzkovich.org/api/scholar-sync" \
    YOUR_QC_SECRET
"""

import re
import sys
import time
import random
import requests

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    sys.exit("Run: pip3 install selenium webdriver-manager")

SCHOLAR_PROFILE = "https://scholar.google.com/citations?user=HyN_EIgAAAAJ&hl=en&sortby=citations"
OWNER_FRAGMENT  = "itzkovich"
PAGE_SIZE       = 10   # Scholar shows 10 results per page
DELAY           = (2, 4)  # random sleep range between requests (seconds)


def sleep():
    time.sleep(random.uniform(*DELAY))


def make_driver():
    options = Options()
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })
    driver.maximize_window()
    return driver


def get_papers_from_profile(driver):
    """Load profile page, click Show More, return list of {title, count, cites_id}."""
    print("Loading Scholar profile …")
    driver.get(SCHOLAR_PROFILE)
    sleep()

    # Click "Show more" until all papers are loaded
    while True:
        try:
            btn = driver.find_element(By.ID, "gsc_bpf_more")
            if btn.is_enabled() and btn.is_displayed():
                driver.execute_script("arguments[0].click();", btn)
                sleep()
            else:
                break
        except Exception:
            break

    rows = driver.find_elements(By.CSS_SELECTOR, "tr.gsc_a_tr")
    papers = []
    for row in rows:
        try:
            title_el = row.find_element(By.CSS_SELECTOR, ".gsc_a_at")
            cite_el  = row.find_element(By.CSS_SELECTOR, ".gsc_a_ac")
            title    = title_el.text.strip()
            count    = int(cite_el.text.strip()) if cite_el.text.strip().isdigit() else 0
            href     = cite_el.get_attribute("href") or ""
            m        = re.search(r"cites=(\d+)", href)
            cites_id = m.group(1) if m else None
            papers.append({"title": title, "count": count, "cites_id": cites_id})
        except Exception:
            continue

    print(f"  Found {len(papers)} papers on profile.")
    return papers


def get_citing_papers(driver, cites_id, total):
    """Fetch all citing papers for a given cluster ID. Returns list of author strings."""
    all_authors = []
    page        = 0
    max_pages   = min((total // PAGE_SIZE) + 2, 20)  # cap at 200 citing papers

    while page < max_pages:
        url = (f"https://scholar.google.com/scholar?cites={cites_id}"
               f"&hl=en&num=10&start={page * PAGE_SIZE}")
        driver.get(url)
        sleep()

        results = driver.find_elements(By.CSS_SELECTOR, ".gs_r.gs_or.gs_scl")
        if not results:
            break

        for r in results:
            try:
                author_el = r.find_element(By.CSS_SELECTOR, ".gs_a")
                all_authors.append(author_el.text.strip())
            except Exception:
                all_authors.append("")

        print(f"    page {page+1}: {len(results)} results", end="\r")
        if len(results) < PAGE_SIZE:
            break
        page += 1

    print()
    return all_authors


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 scholar-citing-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]
    doi_url   = "https://yarivitzkovich.org/papers-doi.json"

    # Load slug map
    print(f"Loading paper list from {doi_url} …")
    r = requests.get(doi_url, timeout=15)
    r.raise_for_status()
    site_papers = r.json()["papers"]

    from difflib import SequenceMatcher
    def norm(s):
        return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()

    slug_map = {norm(p["title"]): p["slug"] for p in site_papers}

    def match_slug(title):
        nt = norm(title)
        if nt in slug_map:
            return slug_map[nt]
        best, bslug = 0.0, None
        for nt2, s in slug_map.items():
            sc = SequenceMatcher(None, nt, nt2).ratio()
            if sc > best:
                best, bslug = sc, s
        return bslug if best >= 0.72 else None

    driver = make_driver()

    try:
        papers = get_papers_from_profile(driver)
        results = []

        for i, paper in enumerate(papers):
            slug = match_slug(paper["title"])
            if not slug:
                print(f"[{i+1}/{len(papers)}] UNMATCHED: {paper['title'][:60]}")
                continue

            count    = paper["count"]
            cites_id = paper["cites_id"]

            if count == 0 or not cites_id:
                results.append({
                    "slug": slug,
                    "citation_count": count,
                    "self_citation_count": 0,
                    "citing_papers": [],
                })
                continue

            print(f"\n[{i+1}/{len(papers)}] {paper['title'][:65]}")
            print(f"  {count} citations — fetching citing papers …")
            sleep()

            author_lines = get_citing_papers(driver, cites_id, count)

            citing_papers = []
            self_count    = 0
            for line in author_lines:
                is_self = OWNER_FRAGMENT in line.lower()
                if is_self:
                    self_count += 1
                citing_papers.append({"authors": line, "is_self": is_self})

            external = count - self_count
            print(f"  → {count} total | {self_count} self | {external} external")

            results.append({
                "slug":                slug,
                "citation_count":      count,
                "self_citation_count": self_count,
                "citing_papers":       citing_papers,
            })

    finally:
        driver.quit()

    if not results:
        sys.exit("No results collected.")

    print(f"\nPOSTing {len(results)} papers to {api_url} …")
    r = requests.post(
        api_url,
        json={"source": "google_scholar_selfcite", "papers": results},
        headers={"x-qc-token": qc_secret, "content-type": "application/json"},
        timeout=30,
    )
    print(f"Response {r.status_code}: {r.text[:300]}")

    total_self  = sum(p["self_citation_count"] for p in results)
    total_cites = sum(p["citation_count"] for p in results)
    print(f"\nDone. {total_self} self-citations out of {total_cites} total ({round(total_self/total_cites*100) if total_cites else 0}%).")


if __name__ == "__main__":
    main()
