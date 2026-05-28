# yarivitzkovich-site — Visual deploy audit

Handoff doc for the audit workstream. Read this first whenever you (or a new Claude session) pick up the audit work.

## Current state (v0.2)

| Cell file | Cells | Pass | Notes |
|---|---|---|---|
| `01-home-page.mjs` | HOME-no-errors, HOME-nav | 2/2 | Catches console / page / network errors and broken nav links |
| `02-static-pages.mjs` | STATIC-{about, research, teaching, conferences, publications, subscribe, live} | 7/7 | One cell per top-level public page |
| `03-subscribe.mjs` | SUB-empty-blocked, SUB-valid-success, SUB-server-error | 3/3 | Mocks `/api/subscribe` via `page.route()` — no D1 writes, no real emails |
| `04-hebrew.mjs` | HE-home, HE-teaching, HE-nav-toggle | 3/3 | Verifies `lang=he`, `dir=rtl`, locale toggle |
| `05-prod-smoke.mjs` | PROD-{home, publications, hebrew, api-me, live-totals, live-events} | 6/6 | HTTP-only probes against `https://yarivitzkovich.org`. Strict GET — no side effects |

**Total: 21 cells across 5 suites. All green at v0.2.**

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

### 06-publication-detail.mjs

A single publication detail page (`/publications/<slug>`) should load
cleanly, render title + authors + abstract, and have a working "Cite"
copy-to-clipboard. Currently uncovered — `STATIC-publications` only
hits the index.

### 07-topics.mjs

`/topics/<id>` pages and `/topics` index. Same shape as publication
detail but for topic taxonomy.

### 08-search.mjs

The `Search` overlay opens, accepts input, returns results (Pagefind
index built at `npm run build` time). Needs `dist/` to exist — best
run under wrangler substrate.

### 09-contact.mjs

The `#contact` anchor on `/` reveals contact info; verify the section
renders + email link copies to clipboard. Low priority — static markup.

### 10-citations.mjs

When the citations system is deployed (see
`project_citations_system.md` memory), add cells for:
- `/api/citations` returning the right metric for a known paper id
- `/manage/citations` admin UI loading without errors

Needs `wrangler pages dev` so the D1 binding + secrets work.

### 11-book.mjs

When the *Uneconomic Relations* book page goes live (per
`book_uneconomic_relations.md` memory), cover-art route + reader flow.

## Rollback

The `v0.2` git tag points at this baseline state. If a future change
regresses the audit, return to the known-good:

```bash
cd ~/Code/yarivitzkovich-site
git checkout v0.2
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
   `git tag v0.3 -m "..."`.
