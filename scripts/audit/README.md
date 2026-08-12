# yarivitzkovich-site — Visual deploy audit

Handoff doc for the audit workstream. Read this first whenever you (or a new Claude session) pick up the audit work.

## Current state (v1.6)

### Pre-gate: `scripts/check-local-migrations.mjs`

Runs FIRST, before any browser cell, whenever the substrate is wrangler (`:4324`). It replays every `CREATE TABLE` in `db/migrations/*.sql` and asserts each table exists in the local D1; if any are missing the gate exits 1 **without running a single cell**.

Why it exists (2026-08-12): the local D1 at the persist path had never been migrated, so `/api/citations` 500'd with `no such table: citation_cache` and `/live/*` 500'd the same way. Two of the gate's three reds traced to that — the harness reporting its own broken state as if the site were broken, while production was fine throughout. A gate that cries wolf is worse than no gate.

- **Persist path matters.** This repo runs its substrate with `--persist-to /tmp/wrangler-yariv-state`, *not* wrangler's default `.wrangler/state`. The preflight passes the same flag; without it it would inspect a different, empty DB and report a cheerful green. Override with `WRANGLER_PERSIST_TO`.
- **Fix:** `node scripts/check-local-migrations.mjs --fix` (or the printed `wrangler d1 migrations apply` line), then restart the substrate so miniflare re-opens the DB.
- **Bypass:** `node scripts/deploy-gate.mjs --skip-migrations`. Skipped automatically on the astro-dev fallback, which never runs Pages Functions or touches D1.

### Cells

| Cell file | Cells | Pass | Notes |
|---|---|---|---|
| `01-home-page.mjs` | HOME-no-errors, HOME-nav | 2/2 | Catches console / page / network errors and broken nav links |
| `02-static-pages.mjs` | STATIC-{about, research, teaching, conferences, publications, subscribe, live} | 7/7 | One cell per top-level public page |
| `03-subscribe.mjs` | SUB-empty-blocked, SUB-valid-success, SUB-server-error | 3/3 | Mocks `/api/subscribe` via `page.route()` — no D1 writes, no real emails |
| `04-hebrew.mjs` | HE-home, HE-teaching, HE-nav-toggle | 3/3 | Verifies `lang=he`, `dir=rtl`, locale toggle |
| `05-prod-smoke.mjs` | PROD-{home, publications, hebrew, api-me, live-totals, live-events} | 6/6 | HTTP-only probes against `https://yarivitzkovich.org`. Strict GET — no side effects |
| `06-publication-detail.mjs` | PUB-detail-loads, PUB-detail-content | 2/2 | Sentinel slug `incivility-inhibit-intrapreneurship` loads + title/author render |
| `07-topics.mjs` | TOPIC-index, TOPIC-detail-loads, TOPIC-detail-content | 3/3 | `/topics` lists Incivility; `/topics/incivility` renders papers |
| `08-search.mjs` | SEARCH-pagefind-loads, SEARCH-overlay-opens, SEARCH-returns-result | 3/3 | Overlay opens, Pagefind index reachable, query returns results. Auto-skips under astro substrate (no `/pagefind/` path) |
| `09-contact.mjs` | CONTACT-anchor-resolves, CONTACT-channels-present | 2/2 | `#contact` exists; email + WhatsApp + ORCID links present |
| `10-version-stamp.mjs` | STAMP-present-home, STAMP-format-correct, STAMP-present-other, STAMP-theme-adaptive | 4/4 | Build-time `v1.YYYY.MM.DD-<sha>` stamp in `BaseLayout.astro` renders on every page; `STAMP-theme-adaptive` proves the color flips light↔dark (catches the v1.3→v1.4 legibility regression) |
| `11-contact-qr.mjs` | QR-present, QR-decodes, QR-no-secrets | 3/3 | vCard QR in the `#contact` footer (`ContactQR.astro`). `QR-decodes` screenshots the rendered tile (incl. monogram) and decodes it with jsQR — proves it actually SCANS. `QR-no-secrets` fails if the payload ever carries a token/login link. Runs at deviceScaleFactor 3 (retina phone). |
| `12-book-chapters.mjs` | BOOK-lists-chapters | 1/1 | Opens the book and asserts it lists its 7 chapters |
| `13-title-casing.mjs` | TITLE-sentence-case ×3 | 3/3 | Three sentinel publication slugs render sentence-case titles, with the bad casing absent anywhere in the DOM |

**Total: 42 cells across 13 suites, plus the local-D1 pre-gate. All green at v1.6.**

## Versioning convention

Two distinct versions:

- **Audit-gate tags** — `v1.0` (baseline), `v1.1` (wrangler substrate), `v1.2` (coverage expansion), `v1.3` (version stamp), `v1.4` (stamp legibility fix), `v1.5` (contact-zone vCard QR), `v1.6` (local-D1 pre-gate + suites 12/13 documented). One bump per meaningful addition to the harness or to the site (new cells, new feature, new substrate, fixes). Rollback points.
- **Website version stamp** — `v1.YYYY.MM.DD-<short-sha>` rendered fixed bottom-left of every page (see `src/layouts/BaseLayout.astro`). The `1.` prefix is hardcoded as the major-version anchor (bump to `2.` only on a breaking-change-class rebuild). The date and SHA derive automatically at `npm run build` time — zero manual edits.

Earlier `v0.x` tags were rebased to `v1.x` on 2026-05-29 to match the "start at 1" convention. The original commits are unchanged.

## Two substrates

The audit can run against either dev substrate. The gate auto-detects
which one is up on the local port and applies appropriate filters.

### Preferred: `wrangler pages dev` (port 4324)

**Pages Functions execute.** `/api/me`, `/live/totals`, `/live/events`
all return real JSON. Closest to production. Required before any
production deploy.

```bash
cd ~/Code/yarivitzkovich-site
npm run build                        # build dist/
# One-time: apply D1 migrations to the local store
npx wrangler d1 migrations apply yarivitzkovich-events --local \
  --persist-to /tmp/wrangler-yariv-state
# Boot the substrate
npx wrangler pages dev dist --port 4324 --local \
  --persist-to /tmp/wrangler-yariv-state
# In another terminal:
node scripts/deploy-gate.mjs
```

### Fallback: `astro dev` (port 4321)

**Pages Functions do NOT execute** — `/api/*` and `/live/*` 404. The
audit library filters those as environment artifacts so the dev cells
still go green, but `05-prod-smoke.mjs` doesn't touch local at all so
it's unaffected. Use this when iterating on Astro pages and you don't
need Pages Function fidelity.

```bash
cd ~/Code/yarivitzkovich-site
npm run dev                          # http://localhost:4321
node scripts/deploy-gate.mjs
```

### Gate flags

```bash
node scripts/deploy-gate.mjs                    # auto-detect substrate
node scripts/deploy-gate.mjs --only 01          # one suite
node scripts/deploy-gate.mjs --port 4322        # explicit port
node scripts/deploy-gate.mjs --skip-build       # don't probe dev server
SKIP_PROD_SMOKE=1 node scripts/deploy-gate.mjs  # offline iteration
AUDIT_SUBSTRATE=astro node scripts/deploy-gate.mjs  # force substrate
```

When all green: `npm run build` and `wrangler pages deploy dist`. Per
`~/.claude/projects/-Users-yarivitzkovich-Downloads/memory/skill_visual_deploy_audit.md`,
the gate **must pass** before any production deploy.

## Bugs fixed for v0.1

1. **Duplicate React key on `/publications`.** Two MDX entries shared
   `id: itzkovich2017-incivility` —
   `incivility-empathy-ethical-climate-hospital.mdx` (book chapter) and
   `incivility-inhibit-intrapreneurship.mdx` (journal article). React
   warned and any list grouping by id silently dropped one. Renamed the
   article's id to `itzkovich2017-incivility-intrapreneurship`. Caught
   by `STATIC-publications`.

## Bugs fixed for v0.2

(none — v0.2 was substrate hardening, not bug fixes. Adds wrangler
support + prod smoke.)

## Filters added for v0.3

- `/api/citations?slug=X` returning **404** is documented behavior
  (paper has no cached citation data — see `functions/api/citations.js`
  line ~140). Filtered globally in `audit-lib.mjs`. A 500 from that
  endpoint still surfaces as a real failure.
- `06-publication-detail.mjs` uses `waitUntil: 'domcontentloaded'`
  instead of `networkidle` because the page legitimately fetches
  `/api/citations` and that fetch can take >20s on a cold local D1.

## Bugs fixed for v0.3

(none — v0.3 was coverage expansion. Found one limitation worth
remembering: `/publications/<slug>` triggers a `/api/citations` fetch
that hangs networkidle when citation_cache is empty. Documented above.)

## Bugs fixed for v1.3

(none — v1.3 added the build-time version stamp and rebased v0.x tags
to v1.x. No regressions caught; the new `10-version-stamp.mjs` suite
enforces stamp presence and format on every future build.)

## How to build the next cell (recipe)

Each new cell follows `01-home-page.mjs` (browser-driven) or
`05-prod-smoke.mjs` (HTTP-only) as the template.

1. **Decide the flow.** What does the user click? What table changes?
   What visible state changes?
2. **Compute the absolute expected outcome BEFORE clicking.** Not
   "something happens" — exact text, exact route, exact attribute.
3. **`observerMark()`** before the click.
4. **Click + wait.** Use Playwright locators by visible role/text.
5. **Read the visible state.** Assert on the rendered string — not on a
   network response or a console line.
6. **`observerSnapshot()`** after; assert no console / page errors
   and no unfiltered 4xx/5xx subresources.
7. **Report cell pass/fail with a SPECIFIC `notes:` string per
   failure mode.** The next session reading the report should
   understand the bug in one line.

For prod smoke cells, use `new Audit({ noBrowser: true })` and plain
`fetch()` with `redirect: 'follow'`. Strictly GET — never POST against
production.

## Cells still to build (priority order)

### 10-citations.mjs

When the citations system is deployed (see
`project_citations_system.md` memory), add cells for:
- `/api/citations?slug=X` for a known paper id with cached data
  returning 200 with `{ ok: true, citation_count: number }`
- `/api/citations` (no slug) requires owner auth → 401 for anon
- `/manage/citations` admin UI loading without errors (owner cookie)

Needs `wrangler pages dev` so the D1 binding + secrets work, plus a
seeded `citation_cache` row to assert on.

### 11-book.mjs

When the *Uneconomic Relations* book page goes live (per
`book_uneconomic_relations.md` memory), cover-art route + reader flow.

### 12-cite-clipboard.mjs

The publication detail page has citation copy-to-clipboard buttons
(BibTeX, APA, etc — see `PublicationsBrowser.tsx` around line 980).
A cell that clicks one and asserts the clipboard contents would catch
"copy is silently broken" regressions. Playwright supports the
clipboard API via `permissions: ['clipboard-read', 'clipboard-write']`
on the context.

### 13-cite-counter.mjs

Currently the publication detail page sends `/api/citations?slug=X`
and that 404 is filtered in audit-lib. When the citations system is
deployed and that endpoint returns 200 for known slugs, a cell that
asserts the "Cited by N" badge actually renders would catch the
"endpoint works but badge never appears" class of bug.

## Rollback

The `v1.3` git tag points at this baseline state (v1.0 / v1.1 / v1.2
are also available for older rollback points). If a future change
regresses the audit, return to the known-good:

```bash
cd ~/Code/yarivitzkovich-site
git checkout v1.3
```

Then re-deploy or branch off to fix.

## When you (or a fresh session) pick this up

1. Open Claude Code in `~/Code/yarivitzkovich-site`. Memory files load
   automatically.
2. Say: "continue the audit work — read scripts/audit/README.md".
3. Pick a cell to build from the priority list, or write a new cell
   that reproduces the bug you're chasing.
4. Build it. Run `node scripts/deploy-gate.mjs --only <prefix>`. Fix
   until green. Commit.
5. When you have meaningful new cells passing, bump the git tag:
   `git tag v1.4 -m "..."`.
