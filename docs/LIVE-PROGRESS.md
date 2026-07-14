# LIVE PROGRESS — running log (updated after every step)

**For a NEW session:** open Claude Code in `~/Code/yarivitzkovich-site` and say:
> Read docs/LIVE-PROGRESS.md and continue from the last line.

**Yariv's copy-link (GitHub):** https://github.com/itzkovichyariv-star/yarivitzkovich-site/blob/main/docs/LIVE-PROGRESS.md
**Local path:** /Users/yarivitzkovich/Code/yarivitzkovich-site/docs/LIVE-PROGRESS.md

Binding rule (same as family-tasks): during any working session the assistant appends a line here after EVERY meaningful step and commits+pushes it, so this page is always the live state of the project. Newest entries at the bottom.

---
## LOG (newest at bottom)

- 2026-06-11 — Live-progress log created (mirrors the family-tasks pattern Yariv asked to replicate). No active workstream in this repo right now; the next session starts logging here.
- 2026-07-14 — **Admin `/manage/events`: added full geographic/paper breakdown matrix.** Yariv asked to see downloads/visits/returning broken down by city AND by country AND by paper (previously only "Downloads · by paper" + "Visits · by city" existed). Rebuilt `src/components/BreakdownDrawer.tsx`: replaced the old `PaperBreakdown` + `CountryBreakdown` sections with one `BreakdownMatrix` — a **City / Country / Paper dimension switcher** (styled like the Range tabs) that reslices **four metric columns**: Visits, First-time, Returning, Downloads. All client-side; no DB/endpoint change (the `/live/details` payload already carries kind, visitor_class, city, country_name, paper_slug). "By paper" counts only events with a paper_slug (publication-page visits + all downloads); null-city events fall back to their country label; bots excluded. VERIFIED: exact-match SSR check of the real component with mock events across all 3 dimensions × 4 metrics (hand-computed expected == rendered), plus clean `npm run build` (81 pages). Deploy-gate static public cells 06/07/10/13 PASS; cell 01 (home) red is a known astro-dev substrate artifact (`/api/citations` 404 — Pages Functions need `wrangler pages dev`), reproduces on `main`, unrelated (home doesn't import the component). Could NOT do a live-browser click of the switcher (Chrome extension not connected) — dimension render paths proven via SSR, but the onClick wiring wasn't clicked in a browser. Committed + pushed to `main` → Cloudflare Pages auto-deploys (build-time stamp will read `v1.2026.07.14-<newsha>`). **STILL OPEN / next step:** Yariv smoke-tests the live `/manage/events` as owner — click City/Country/Paper, confirm the switcher toggles and real numbers look right on his iPhone + desktop. If the switcher doesn't respond, the only unverified piece is the client onClick handler.
