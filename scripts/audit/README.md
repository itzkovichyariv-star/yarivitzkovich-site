# yarivitzkovich-site — Visual deploy audit

Handoff doc for the audit workstream. Read this first whenever you (or a new Claude session) pick up the audit work.

## Current state (v0.1)

| Cell file | Cells | Pass | Notes |
|---|---|---|---|
| `01-home-page.mjs` | HOME-no-errors, HOME-nav | 2/2 | Catches console/page/network errors and broken nav links |
| `02-static-pages.mjs` | STATIC-{about,research,teaching,conferences,publications,subscribe,live} | 7/7 | One cell per top-level public page |
| `03-subscribe.mjs` | SUB-empty-blocked, SUB-valid-success, SUB-server-error | 3/3 | Mocks `/api/subscribe` — no D1 writes, no real emails |
| `04-hebrew.mjs` | HE-home, HE-teaching, HE-nav-toggle | 3/3 | Verifies `lang=he`, `dir=rtl`, locale toggle |

**Total: 15 cells across 4 files. All green at v0.1.**

## How to run

```bash
cd ~/Code/yarivitzkovich-site
npm run dev                       # http://localhost:4321
node scripts/deploy-gate.mjs      # run every cell
node scripts/deploy-gate.mjs --only 01      # just the homepage suite
node scripts/deploy-gate.mjs --port 4322    # if Astro picked a different port
```

When green: `npm run build` then `wrangler pages deploy dist`.

The gate **must pass** before any production deploy. This is the same
rule as the family-tasks and practicum-v2 projects (see
`~/.claude/projects/-Users-yarivitzkovich-Downloads/memory/skill_visual_deploy_audit.md`).

## Known dev/prod gaps

The audit runs against `astro dev` (vite), not `wrangler pages dev`.
This means **Cloudflare Pages Functions don't execute in dev** and any
request to `/api/*` or `/live/*` returns 404. `audit-lib.mjs` filters
these 404s as dev-environment artifacts so the gate isn't permanently
red. Consequences:

- `/api/me` 404 is filtered. Owner-only nav links stay hidden — fine.
- `/live/events?range=7d` and `/live/totals` 404 are filtered. The
  globe page renders without live data — the cell still verifies the
  page loads and React renders without errors.
- Subscribe form 03-subscribe is **mocked** end-to-end with
  `page.route()` — the audit never POSTs to a real `/api/subscribe`.

If you want full Pages Function fidelity, you'd need to switch the gate
to probe a `wrangler pages dev` server instead. Pinned for a future
revision; not blocking v0.1.

## Bugs fixed for v0.1

1. **Duplicate React key on `/publications`.** Two MDX entries shared
   `id: itzkovich2017-incivility` —
   `incivility-empathy-ethical-climate-hospital.mdx` (book chapter) and
   `incivility-inhibit-intrapreneurship.mdx` (journal article). React
   warned and any list grouping by id silently dropped one. Renamed the
   article's id to `itzkovich2017-incivility-intrapreneurship`. Caught
   by `STATIC-publications`.

## How to build the next cell (recipe)

Each new cell follows `01-home-page.mjs` as the template:

1. **Decide the flow.** What does the user click? What table changes?
   What visible state changes?
2. **Compute the absolute expected outcome BEFORE clicking.** Not
   "something happens" — exact text, exact route, exact attribute.
3. **`observerMark()`** before the click.
4. **Click + wait.** Use Playwright locators by visible role/text.
5. **Read the visible state.** If the cell touches state (a form,
   the URL, the DOM), assert on the rendered string — not on a
   network response or a console line.
6. **`observerSnapshot()`** after; assert no console / page errors
   and no unfiltered 4xx/5xx subresources.
7. **Report cell pass/fail with a SPECIFIC `notes:` string per
   failure mode.** The next session reading the report should
   understand the bug in one line.

## Cells still to build (priority order)

These are the obvious surfaces that v0.1 doesn't cover. Pick one when a
new bug surfaces or when adding new functionality:

### 05-publication-detail.mjs

A single publication detail page (`/publications/<slug>`) should load
cleanly, render title + authors + abstract, and have a working "Cite"
copy-to-clipboard. Currently uncovered — `STATIC-publications` only
hits the index.

### 06-topics.mjs

`/topics/<id>` pages and `/topics` index. Same shape as publication
detail but for topic taxonomy.

### 07-search.mjs

The `Search` overlay opens, accepts input, returns results (Pagefind
index built at `npm run build` time). Skip unless `dist/` exists or
build is in scope.

### 08-contact.mjs

The `#contact` anchor on `/` reveals contact info; verify the section
renders + email link copies to clipboard. Low priority — static markup.

### 09-citations.mjs

When the citations system is deployed (see
`project_citations_system.md` memory), add cells for:
- `/api/citations` returning the right metric for a known paper id
- `/manage/citations` admin UI loading without errors

Needs `wrangler pages dev` so the D1 binding + ANTHROPIC_API_KEY work.

### 10-book.mjs

When the *Uneconomic Relations* book page goes live (per
`book_uneconomic_relations.md` memory), cover-art route + reader
flow.

## Rollback

The `v0.1` git tag points at this baseline state. If a future change
regresses the audit, return to the known-good:

```bash
cd ~/Code/yarivitzkovich-site
git checkout v0.1
```

Then re-deploy or branch off to fix.

## When you (or a fresh session) pick this up

1. Open Claude Code in `~/Code/yarivitzkovich-site`. Memory files load
   automatically.
2. Say: "continue the audit work — read scripts/audit/README.md".
3. Pick a cell to build from the priority list, or write a new cell that
   reproduces the bug you're chasing.
4. Build it. Run `node scripts/deploy-gate.mjs --only <prefix>`. Fix
   until green. Commit.
5. When you have meaningful new cells passing, bump the git tag:
   `git tag v0.2 -m "..."`.
