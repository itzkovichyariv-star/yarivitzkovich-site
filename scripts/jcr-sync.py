#!/usr/bin/env python3
"""
Collects JCR Impact Factor, quartile, and percentile for every journal
in the publications collection by automating jcr.clarivate.com using
your existing Chrome login session.

Requirements (one-time):
  pip3 install selenium webdriver-manager

IMPORTANT: Quit Chrome completely before running this script.
           Your JCR institutional login is picked up automatically
           from your Chrome profile — no password needed.

Usage:
  python3 scripts/jcr-sync.py <api_url> <qc_secret>

Example:
  python3 scripts/jcr-sync.py \
    "https://yarivitzkovich.org/api/journal-sync" \
    494fc30488a603d7e8c7c9ce5ae27298f61420f47a9723ecb08cf46b57c076c1
"""

import json
import os
import re
import sys
import time

import requests

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    sys.exit(
        "Missing packages. Run:\n"
        "  pip3 install selenium webdriver-manager\n"
        "then try again."
    )

# ── Journals to collect (all unique venues from the publications collection) ──
JOURNALS = [
    "Current Psychology",
    "Deviant Behavior",
    "Disability and Rehabilitation",
    "Entrepreneurship Research Journal",
    "Ethics & Behavior",
    "EuroMed Journal of Business",
    "Frontiers in Psychology",
    "Higher Education",
    "Human-Computer Interaction",
    "Information and Software Technology",
    "International Journal of Environmental Research and Public Health",
    "International Journal of Work Organization and Emotion",
    "International Journal of Workplace Health Management",
    "Journal of Academic Ethics",
    "Journal of Aggression, Maltreatment & Trauma",
    "Journal of Cleaner Production",
    "Journal of Entrepreneurship",
    "Journal of Management Development",
    "Journal of Management Research",
    "Journal of Managerial Psychology",
    "Journal of Social Work",
    "Nonprofit Management & Leadership",
    "Personnel Review",
    "Societies",
    "Sustainability",
    "Wirtschaftspsychologie",
    "Work",
]

CHROME_PROFILE = os.path.expanduser(
    "~/Library/Application Support/Google/Chrome"
)
JCR_BASE  = "https://jcr.clarivate.com"
WAIT_SEC  = 12   # seconds to wait for page elements
PAGE_DELAY = 4   # seconds between journals


def norm(s):
    return re.sub(r"\s+", " ", s.lower().strip())


def word_overlap(a, b):
    wa, wb = set(norm(a).split()), set(norm(b).split())
    return len(wa & wb) / max(len(wa | wb), 1)


def extract_jcr_data(driver, journal_name):
    """Navigate to the JCR journal page and extract IF, quartile, percentile."""
    wait = WebDriverWait(driver, WAIT_SEC)

    # Search for the journal
    search_url = f"{JCR_BASE}/jcr/browse-journals?search={requests.utils.quote(journal_name)}"
    driver.get(search_url)
    time.sleep(PAGE_DELAY)

    # Look for search results — JCR renders a list of matching journals
    try:
        # Wait for result rows to appear
        wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, "app-journal-list-item, .journal-list-item, [class*='journal-row'], [class*='journal-item']")
        ))
    except Exception:
        print(f"  No results page loaded for: {journal_name}")
        return None

    # Find all result rows and pick the best match
    rows = driver.find_elements(
        By.CSS_SELECTOR,
        "app-journal-list-item, .journal-list-item, [class*='journal-row'], [class*='journal-item']"
    )

    best_row, best_score = None, 0.0
    for row in rows:
        row_text = row.text or ""
        first_line = row_text.split("\n")[0].strip()
        score = word_overlap(journal_name, first_line)
        if score > best_score:
            best_score, best_row = score, row

    if best_row is None or best_score < 0.4:
        print(f"  No confident match (best score {best_score:.2f})")
        return None

    print(f"  Matched (score {best_score:.2f}) — clicking …")
    try:
        best_row.click()
    except Exception:
        driver.execute_script("arguments[0].click();", best_row)
    time.sleep(PAGE_DELAY)

    # Now on the journal detail page — extract metrics from the page text
    page_text = driver.find_element(By.TAG_NAME, "body").text

    impact_factor = None
    jcr_quartile  = None
    percentile    = None

    # Impact Factor — "2.345" or "Impact Factor: 2.345"
    m = re.search(r"(?:impact factor|jif)[^\d]*(\d[\d,]*\.?\d*)", page_text, re.I)
    if m:
        try:
            impact_factor = float(m.group(1).replace(",", "."))
        except ValueError:
            pass

    # JCR Quartile — "Q1", "Q2", etc.
    qs = re.findall(r"\bQ([1-4])\b", page_text)
    if qs:
        jcr_quartile = f"Q{min(int(q) for q in qs)}"

    # Percentile — "Percentile: 87" or "87th percentile"
    m2 = re.search(r"(\d{1,3})(?:st|nd|rd|th)?\s*percentile", page_text, re.I)
    if not m2:
        m2 = re.search(r"percentile[^\d]*(\d{1,3})", page_text, re.I)
    if m2:
        try:
            percentile = int(m2.group(1))
        except ValueError:
            pass

    if not any([impact_factor, jcr_quartile, percentile]):
        # Save page source for debugging
        debug_file = f"/tmp/jcr-debug-{norm(journal_name)[:20]}.txt"
        with open(debug_file, "w") as f:
            f.write(page_text[:3000])
        print(f"  Could not extract data — page snippet saved to {debug_file}")
        return None

    return {
        "impact_factor": impact_factor,
        "jcr_quartile":  jcr_quartile,
        "percentile":    percentile,
    }


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 jcr-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]

    print("Starting Chrome …\n")

    options = Options()
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options,
        )
    except Exception as e:
        sys.exit(f"Could not start Chrome: {e}")

    driver.maximize_window()
    # Hide WebDriver fingerprint so JCR doesn't detect automation
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })

    # Navigate to JCR and wait for user to log in
    print("Opening JCR login page …")
    driver.get(f"{JCR_BASE}/jcr/home")
    time.sleep(3)

    if "login" in driver.current_url.lower() or "sign" in driver.current_url.lower() or "clarivate" not in driver.current_url.lower():
        print("\n" + "="*60)
        print("Please log in to JCR in the Chrome window that just opened.")
        print("Use your Ariel University / institutional credentials.")
        print("="*60)
        input("\nOnce you are logged in and see the JCR home page, press Enter here to continue …")
        time.sleep(2)

    # Switch to the last open window (JCR may have opened new tabs/windows during login)
    handles = driver.window_handles
    if handles:
        driver.switch_to.window(handles[-1])
        time.sleep(1)

    print(f"\nJCR loaded — starting journal collection …\n")

    results = []
    for i, journal in enumerate(JOURNALS):
        print(f"[{i+1}/{len(JOURNALS)}] {journal}")
        try:
            # Always switch to last window before each journal (handles popups/redirects)
            handles = driver.window_handles
            if handles:
                driver.switch_to.window(handles[-1])
            data = extract_jcr_data(driver, journal)
        except Exception as e:
            print(f"  Error: {e}")
            data = None

        if data:
            q  = data.get("jcr_quartile") or "?"
            IF = data.get("impact_factor")
            pct = data.get("percentile")
            print(f"  → {q} | IF {IF:.3f if IF else 'n/a'} | Percentile {pct if pct else 'n/a'}")
            results.append({
                "journal_key":    norm(journal),
                "journal_name":   journal,
                "impact_factor":  IF,
                "jcr_quartile":   q if q != "?" else None,
                "percentile":     pct,
            })
        else:
            print(f"  → Not found / could not parse")

        time.sleep(PAGE_DELAY)

    driver.quit()
    print(f"\nCollected data for {len(results)} journals.")

    if not results:
        sys.exit("No data collected — nothing to POST.")

    # POST to /api/journal-sync
    print(f"POSTing to {api_url} …")
    r = requests.post(
        api_url,
        json={"journals": results},
        headers={"x-qc-token": qc_secret, "content-type": "application/json"},
        timeout=30,
    )
    print(f"Response {r.status_code}: {r.text[:300]}")
    if not r.ok:
        sys.exit(1)

    print(f"\nDone — {len(results)} journals stored in D1.")
    print("\nSummary:")
    for j in results:
        print(f"  {j['journal_name'][:45]:45s}  {j.get('jcr_quartile','?'):3s}  IF {j.get('impact_factor') or 'n/a'}")


if __name__ == "__main__":
    main()
