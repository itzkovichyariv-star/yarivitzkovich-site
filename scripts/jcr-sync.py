#!/usr/bin/env python3
"""
Collects JCR Impact Factor, quartile, and percentile for every journal
in the publications collection by automating jcr.clarivate.com.

Uses undetected_chromedriver — a Selenium fork that patches Chrome at a
deep level so JCR's bot-detection cannot see the WebDriver fingerprint.

Requirements (one-time):
  pip3 install undetected-chromedriver requests

IMPORTANT: Quit Chrome completely before running this script.

Usage:
  python3 scripts/jcr-sync.py <api_url> <qc_secret>

Example:
  python3 scripts/jcr-sync.py \
    "https://yarivitzkovich.org/api/journal-sync" \
    "<your-sync-token>"
"""

import json
import os
import re
import sys
import time

import requests

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
except ImportError:
    sys.exit(
        "Missing packages. Run:\n"
        "  pip3 install undetected-chromedriver requests\n"
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

JCR_BASE   = "https://jcr.clarivate.com"
WAIT_SEC   = 15   # seconds to wait for page elements
PAGE_DELAY = 5    # seconds between journals
PROGRESS_FILE = "/tmp/jcr-sync-progress.json"


def norm(s):
    return re.sub(r"\s+", " ", s.lower().strip())


def word_overlap(a, b):
    wa, wb = set(norm(a).split()), set(norm(b).split())
    return len(wa & wb) / max(len(wa | wb), 1)


def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--window-size=1280,900")
    driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
    return driver


def extract_jcr_data(driver, journal_name):
    """Navigate to the JCR journal page and extract IF, quartile, percentile."""
    wait = WebDriverWait(driver, WAIT_SEC)

    search_url = (
        f"{JCR_BASE}/jcr/browse-journals"
        f"?search={requests.utils.quote(journal_name)}"
    )
    try:
        driver.get(search_url)
    except Exception as e:
        print(f"  Navigation error: {e}")
        return None
    time.sleep(PAGE_DELAY)

    # Wait for result rows
    try:
        wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR,
             "app-journal-list-item, .journal-list-item, "
             "[class*='journal-row'], [class*='journal-item']")
        ))
    except Exception:
        print(f"  No results page loaded for: {journal_name}")
        # Save debug
        try:
            debug_file = f"/tmp/jcr-debug-{norm(journal_name)[:20]}.txt"
            with open(debug_file, "w") as f:
                f.write(driver.find_element(By.TAG_NAME, "body").text[:3000])
            print(f"  Page text saved to {debug_file}")
        except Exception:
            pass
        return None

    rows = driver.find_elements(
        By.CSS_SELECTOR,
        "app-journal-list-item, .journal-list-item, "
        "[class*='journal-row'], [class*='journal-item']"
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

    # Extract metrics from page text
    try:
        page_text = driver.find_element(By.TAG_NAME, "body").text
    except Exception as e:
        print(f"  Could not read page: {e}")
        return None

    impact_factor = None
    jcr_quartile  = None
    percentile    = None

    m = re.search(r"(?:impact factor|jif)[^\d]*(\d[\d,]*\.?\d*)", page_text, re.I)
    if m:
        try:
            impact_factor = float(m.group(1).replace(",", "."))
        except ValueError:
            pass

    qs = re.findall(r"\bQ([1-4])\b", page_text)
    if qs:
        jcr_quartile = f"Q{min(int(q) for q in qs)}"

    m2 = re.search(r"(\d{1,3})(?:st|nd|rd|th)?\s*percentile", page_text, re.I)
    if not m2:
        m2 = re.search(r"percentile[^\d]*(\d{1,3})", page_text, re.I)
    if m2:
        try:
            percentile = int(m2.group(1))
        except ValueError:
            pass

    if not any([impact_factor, jcr_quartile, percentile]):
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


def load_progress():
    """Load previously collected results so we can resume after a crash."""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE) as f:
                data = json.load(f)
            print(f"  Resuming from saved progress ({len(data)} journals done).")
            return data
        except Exception:
            pass
    return []


def save_progress(results):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(results, f)


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 jcr-sync.py <api_url> <qc_secret>")

    api_url   = sys.argv[1]
    qc_secret = sys.argv[2]

    # Resume support — skip already-collected journals
    results     = load_progress()
    done_keys   = {r["journal_key"] for r in results}
    remaining   = [j for j in JOURNALS if norm(j) not in done_keys]

    if not remaining:
        print("All journals already collected — skipping to POST.")
    else:
        print(f"Starting Chrome (undetected) …  {len(remaining)} journals to collect.\n")
        try:
            driver = make_driver()
        except Exception as e:
            sys.exit(f"Could not start Chrome: {e}")

        driver.maximize_window()

        # Navigate to JCR home and wait for login if needed
        print("Opening JCR …")
        driver.get(f"{JCR_BASE}/jcr/home")
        time.sleep(4)

        url_now = driver.current_url.lower()
        if ("login" in url_now or "sign" in url_now or
                "clarivate" not in url_now):
            print("\n" + "=" * 60)
            print("Please log in to JCR in the Chrome window that just opened.")
            print("Use your Ariel University institutional credentials.")
            print("=" * 60)
            input("\nOnce you see the JCR home page, press Enter to continue …")
            time.sleep(2)

        print(f"\nJCR loaded — collecting {len(remaining)} journals …\n")

        for i, journal in enumerate(remaining):
            total_done = len(done_keys) + i + 1
            print(f"[{total_done}/{len(JOURNALS)}] {journal}")

            try:
                # Switch to last window (handles any extra tabs)
                handles = driver.window_handles
                if handles:
                    driver.switch_to.window(handles[-1])
                data = extract_jcr_data(driver, journal)
            except Exception as e:
                print(f"  Error: {e}")
                data = None

            if data:
                q   = data.get("jcr_quartile") or "?"
                IF  = data.get("impact_factor")
                pct = data.get("percentile")
                print(f"  → {q} | IF {f'{IF:.3f}' if IF else 'n/a'} | "
                      f"Percentile {pct if pct else 'n/a'}")
                entry = {
                    "journal_key":   norm(journal),
                    "journal_name":  journal,
                    "impact_factor": IF,
                    "jcr_quartile":  q if q != "?" else None,
                    "percentile":    pct,
                }
            else:
                print(f"  → Not found / could not parse")
                entry = {
                    "journal_key":  norm(journal),
                    "journal_name": journal,
                    "impact_factor": None,
                    "jcr_quartile":  None,
                    "percentile":    None,
                }

            results.append(entry)
            save_progress(results)   # save after every journal
            done_keys.add(entry["journal_key"])

            time.sleep(PAGE_DELAY)

        driver.quit()

    # Filter to only rows with at least one metric
    postable = [r for r in results if any(
        r.get(k) for k in ("impact_factor", "jcr_quartile", "percentile")
    )]
    print(f"\nCollected data for {len(postable)}/{len(JOURNALS)} journals.")

    if not postable:
        sys.exit("No data collected — nothing to POST.")

    print(f"POSTing to {api_url} …")
    r = requests.post(
        api_url,
        json={"journals": postable},
        headers={"x-qc-token": qc_secret, "content-type": "application/json"},
        timeout=30,
    )
    print(f"Response {r.status_code}: {r.text[:300]}")
    if not r.ok:
        sys.exit(1)

    # Clear progress file on success
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

    print(f"\nDone — {len(postable)} journals stored in D1.")
    print("\nSummary:")
    for j in postable:
        q  = j.get("jcr_quartile") or "?"
        IF = j.get("impact_factor")
        print(f"  {j['journal_name'][:45]:45s}  {q:3s}  "
              f"IF {f'{IF:.3f}' if IF else 'n/a'}")


if __name__ == "__main__":
    main()
