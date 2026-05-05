# Live Globe — Design Spec

**Status:** approved 2026-05-05 · build not yet started
**Owner:** Yariv (concept) · Claude (build)
**Site:** yarivitzkovich.org
**Page:** `/live`

---

## Decisions locked

| # | Decision | Answer |
|---|---|---|
| 1 | Track downloads only? | **No — track BOTH page visits AND PDF downloads.** Three pin classes. |
| 2 | Pin classes | **3** — first-time visitor, returning visitor, downloader |
| 3 | Pin palette | **Monochromatic within site brand** (3 intensities of accent — see §4) |
| 4 | "Since launch" total | **Required.** Prominently displayed on `/live` page |
| 5 | Public URL | **Public** — no password. `/live` accessible to anyone. |
| 6 | Location detail level | **City + Country + Continent** shown on hover/click and in HUD totals. Cloudflare provides all three from request headers — no third-party API. |
| 7 | Sound | **Off by default.** Quiet toggle in corner. |
| 8 | Historical seed data | **None available** — start counting from launch day |
| 9 | Removable | **Yes.** Feature-flagged via `site.display.liveGlobe` so it can be hidden in one line. |

---

## 1. Vision

A single page on the site, **`/live`**, that opens onto a slowly-rotating dotted globe. As papers are downloaded and visitors arrive around the world, faint ripples expand from the source country and a small light remains as a dot — like ink dropping into water. The page is quiet by default: no chrome, no bright colors, no animations begging for attention. Just the globe turning, occasionally answered by a pulse somewhere on its surface.

The feel is **observatory**, not dashboard. You can sit and watch it for a minute and it earns the time.

---

## 2. Where it lives

- **URL:** `yarivitzkovich.org/live`
- **Navigation entry:** quiet `LIVE` link in the main menu, with a tiny pulsing dot on hover. Not in the hero.
- **Footer link** in the same row as Scholar/ORCID/RG/WoS: `· LIVE`.
- **Direct shareable URLs:** `/live?paper=<slug>` and `/live?range=24h|7d|30d|all`.

---

## 3. The globe — visual treatment

### 3.1 Earth rendering

**Style: halftone dotted earth.**

- Sphere covered in small dots that approximate continent shapes — like a printed magazine map. No textured photo of earth. No neon outlines.
- Dot density proportional to land mass.
- Implementation options (decide at build time):
  - (a) Pre-generated 4096×2048 equirectangular dot mask from Natural Earth land dataset.
  - (b) `globe.gl`'s `hexPolygonsData` mode with continent polygons (more performant, slightly different feel).
- Dot size: ~1.2px at default zoom; scales with camera distance.

### 3.2 Color palette (uses existing site CSS variables)

| Element | Light mode | Dark mode |
|---|---|---|
| Background | `#F4EFE6` (cream) + grain | `#1A1612` (ink) + grain |
| Earth dots | `#1A1612` @ 28% | `#F4EFE6` @ 35% |
| Graticule (very faint lat/lng grid) | `var(--divider)` @ 12% | Same |
| Atmosphere ring | Maroon `#7A1E2B` @ 8%, 1px gradient | Pink `#D98B9A` @ 10% |
| HUD text | `var(--text)` and `var(--text-muted)` | Same |

### 3.3 Idle motion ("liquid feel")

- **Continuous slow rotation:** 0.3 rpm (one full turn every 200 seconds).
- **Resume easing** after user drag: `cubic-bezier(0.22, 1, 0.36, 1)` over 1.6s.
- **Breathing scale:** sphere oscillates between 1.000 and 1.004 over 8s. Subliminal — makes it feel alive rather than mechanical. This is the "liquid".
- **User drag freezes rotation;** resumes after 4s of no input.

### 3.4 Atmosphere / glow

- 1-pixel gradient ring around the sphere using the accent color at 8% opacity, fading outward.
- **No bloom on the earth itself** — bloom is reserved for active pins.

---

## 4. Three pin classes — the "blink" mechanic

The core moment of the page. Three pin types, three colors (all within the site's existing brand), three animation intensities. The hierarchy maps engagement level: cooler/lighter → warmer/darker.

### 4.1 The three classes

| Class | Color (hex) | Source CSS var | Trigger |
|---|---|---|---|
| **First-time visitor** | `#D98B9A` (light pink) @ 60% | `--color-accent-on-dark` | New `localStorage` flag — visitor has never been seen on this device |
| **Returning visitor** | `#A85368` (soft rose) @ 75% | `--color-accent-soft` | `localStorage` flag exists, no PDF downloaded this session |
| **Downloader** | `#7A1E2B` (deep maroon) @ 100% | `--color-accent` | A PDF download was requested |

### 4.2 Animation differences (size, ring count, fade timing)

| | First-time | Returning | Downloader |
|---|---|---|---|
| Pin radius (peak) | 3 px | 4 px | 6 px |
| Bloom (CSS-equivalent blur) | 0 px | 2 px | 6 px |
| Ring count | 1 single ring | 1 single ring (slightly thicker) | 2 concentric rings |
| Ring expansion radius | 0 → 1.8° arc | 0 → 2.4° arc | 0 → 3.0° arc |
| Ring duration | 0.9s | 1.1s | 1.2s |
| Total visible time | 3.0s | 4.0s | 5.0s |
| Fade-to-history opacity | 8% | 14% | 22% |

### 4.3 Sequence per event (downloader example, ~5s total)

```
t = 0.0s    Event arrives via SSE → pin lands at lat/lng
t = 0.0–0.4s   Bright dot fades in (radius 0 → 6px, opacity 0 → 100%, maroon + bloom)
t = 0.0–1.2s   First ring expands (radius 0 → 3°, opacity 80% → 0%)
t = 0.3–1.4s   Second ring expands (offset 300ms, slightly thinner)
t = 0.4–0.6s   Bloom peaks
t = 0.6–4.0s   Dot fades 100% → 30%
t = 4.0–5.0s   Dot settles to history opacity 22%
```

First-time and returning have shorter, simpler versions (single ring, no second concentric, less bloom, faster fade).

### 4.4 Stacking rule

- 2nd event at same coordinate while first ring still expanding → add another concentric ring (don't restart).
- 5+ events at same location within 30s → suppress new rings, just brighten the steady-state dot.

### 4.5 Camera attention

- New event on the back of the sphere → camera eases its rotation by up to 90° over 1.5s to bring the pin into view, then resumes idle rotation.
- Bypassed entirely under `prefers-reduced-motion`.

### 4.6 Sound (off by default)

- Tiny corner toggle. When enabled: a soft 80ms tick at the moment a pin lands. Maroon-tinted accent tone. No tick for first-time visitors (would be too noisy) — only for returning visitors and downloaders.

---

## 5. Layout & HUD

```
┌────────────────────────────────────────────────────────────────┐
│  YARIV / EST. 2026     [search]    EN→HE     [menu ☰]          │ ← existing top nav
├────────────────────────────────────────────────────────────────┤
│  § Ch. ⊙                                                       │
│  Live.                                                         │ ← display serif
│  Where my work travels, in real time.                          │ ← muted lede
│                                                                │
│                       ╱─────╲                                  │
│                    (   GLOBE   )                               │
│                       ╲─────╱                                  │
│                                                                │
│  ┌─Since launch ───┐  ┌─Today ────────┐  ┌─Most recent ─────┐  │
│  │  3,142          │  │  47 ▲ 12      │  │  3 min ago       │  │
│  │  total          │  │  visits today │  │  Hamburg, DE     │  │
│  │  · 47 countries │  │  · 9 dl       │  │  Europe          │  │
│  │  · 6 continents │  │               │  │  Will they str…  │  │
│  └─────────────────┘  └───────────────┘  └──────────────────┘  │
│                                                                │
│  ┌─Activity (24h) ─────────────────────────────────────────┐   │
│  │  ◉  127  visits      (104 first-time, 23 returning)      │  │
│  │  ★   24  downloads   across 8 papers                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─Top continents (24h) ───┐  ┌─Top countries (24h) ────────┐  │
│  │  Europe        ████ 42  │  │  United States  ████████ 18 │  │
│  │  N. America    ███  31  │  │  Israel         █████    12 │  │
│  │  Asia          ██   18  │  │  Germany        ███       7 │  │
│  │  S. America    ▌     4  │  │  United Kingdom ██        5 │  │
│  │  Africa        ▎     2  │  │  Brazil         █         3 │  │
│  │  Oceania       ▎     1  │  │  …                          │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
   SCHOLAR · ORCID · RG · WoS · LIVE   (existing footer + new link)
   ─────────────────────────────────
              © Yariv · 2026
```

### 5.1 Frosted-glass panels ("liquid")

All HUD panels:
- `backdrop-filter: blur(14px)`
- Background: `rgba(<bg>, 0.55)`
- 1px hairline border using `var(--divider)`
- Padding: `1.25rem`
- No corner radius (matches site's editorial flat geometry)

### 5.2 Typography (matches existing site)

- Kickers/labels: `font-mono text-xs uppercase tracking-widest`
- Headings: `font-display` (serif, light weight)
- Numerals (counters): `font-mono` with tabular-nums for alignment

### 5.3 Mobile

- Globe becomes square, full-bleed, takes ~70% of viewport height.
- HUD panels stack vertically below the globe.
- Globe disables breathing scale, caps at 30fps, reduces dot count by 40%.

---

## 6. Page interactions

| Action | Behavior |
|---|---|
| Passive viewing | Globe rotates, events appear when they happen |
| Click any visible pin | Floating glass card: city · country · continent, paper title (if download), time, link |
| Click outside card | Dismiss |
| Filter bar (above globe) | Time window: Live / 24h / 7d / 30d / All. Paper: dropdown with all papers + "All". |
| Drag globe | Pauses idle rotation; resumes after 4s |
| `prefers-reduced-motion` | No rotation, no breathing, no ring pulses — pins still appear instantly with brief fade |

---

## 7. Real-time mechanism

### 7.1 Data flow

```
Visitor arrives at any page
        ↓
Astro layout includes a tiny tracking script
        ↓
Script reads localStorage("visitedBefore") → classifies as new/returning
        ↓
Script POSTs /api/track-visit with {paper_slug?, visitor_class}
        ↓
Pages Function records to D1 (timestamp, country/city from cf headers,
   paper slug if applicable, visitor_class)
        ↓
Function publishes the event to a Durable Object (broadcast hub)
        ↓
DO pushes to every browser currently connected to /live/stream (SSE)
        ↓
Browser receives → triggers correct pin animation for class
```

### 7.2 PDF download tracking

```
Visitor clicks PDF link → /pdfs/<slug>.pdf
        ↓
Pages Function intercepts at the /pdfs/* route
        ↓
Function (a) records download event to D1, (b) streams the PDF file
        ↓
Function publishes to broadcast hub (class = "downloader")
        ↓
SSE → /live → maroon pin
```

### 7.3 SSE specifics

- `/live/stream` returns `text/event-stream`.
- Heartbeat every 25s.
- Auto-reconnect with `Last-Event-ID` to fetch missed events.
- Polling fallback at `/live/events?since=<ts>` every 5s.

### 7.4 Initial page load

- Fetch `/live/events?range=4h` once, render history dots.
- Open SSE for new events.
- "Since launch" total fetched separately at `/live/totals`.

---

## 8. Backend

### 8.1 Cloudflare resources

| Resource | Purpose | Free tier |
|---|---|---|
| Pages Functions | Tracking + API endpoints | 100k req/day |
| D1 (SQLite) | Event storage | 5GB / 5M reads / 100k writes daily |
| Durable Objects | SSE broadcast hub | 1M req/month |
| Workers KV (optional) | Bot ASN cache | Generous free tier |

Stays free at thousands of events/month.

### 8.2 D1 schema

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                -- unix epoch (seconds)
  kind TEXT NOT NULL,                 -- 'visit' | 'download'
  visitor_class TEXT NOT NULL,        -- 'first_time' | 'returning' | 'downloader'
  paper_slug TEXT,                    -- NULL for non-paper page visits
  paper_title TEXT,                   -- denormalized for fast reads
  page_path TEXT,                     -- which page they hit (for visits)
  country TEXT,                       -- ISO-2, e.g. 'DE'
  country_name TEXT,                  -- 'Germany'
  continent TEXT,                     -- ISO continent code, e.g. 'EU'
  continent_name TEXT,                -- 'Europe'
  city TEXT,
  lat REAL,
  lng REAL,
  ip_hash TEXT NOT NULL,              -- SHA256(ip + daily_salt + paper_slug)
  ua_class TEXT,                      -- 'browser' | 'bot' | 'rss' | 'other'
  is_bot INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_ts ON events(ts DESC);
CREATE INDEX idx_kind_ts ON events(kind, ts DESC);
CREATE INDEX idx_country_ts ON events(country, ts DESC);
CREATE INDEX idx_continent_ts ON events(continent, ts DESC);
CREATE INDEX idx_paper_ts ON events(paper_slug, ts DESC) WHERE paper_slug IS NOT NULL;

CREATE TABLE site_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- INSERT INTO site_meta VALUES ('launch_ts', '1746...');  -- set on first deploy
```

### 8.3 Dedup rules

- A given `(ip_hash, kind, paper_slug)` only counts once per 24h.
- Stops one visitor refreshing 50 times from creating 50 pins.

### 8.4 Bot filtering

- User-Agent regex match (curated list).
- Cloudflare's `cf.botManagement.score` (free tier provides basic).
- Bots are still logged but `is_bot=1` and not pinned on the globe.

### 8.5 First-time vs returning detection

- Pure client-side via `localStorage.getItem('yi_visitedBefore')`.
- Per-device approximation (a person on phone+laptop counts as 2 first-times).
- No persistent server identifiers — privacy-clean.

---

## 9. Privacy & ethics

- **No raw IPs stored.** Only daily-rotating salted hash.
- **No cookies** — `localStorage` only, used for new/returning detection on the visitor's own device.
- **City + country + continent** geolocation; no street-level.
- **Public aggregate display:** "Hamburg, Germany — 3 min ago" is similar to what every academic publisher already shows.
- **Privacy note** linked from `/live` footer in plain language.
- **GDPR-compliant by design:** no personal data leaves the visitor's device, no consent banner needed.
- **Bot data** kept for analytics audit but never displayed.

---

## 10. Tech stack

| Layer | Choice | Why |
|---|---|---|
| 3D rendering | **globe.gl** (built on three.js) | Mature, declarative, points/rings/arcs out of the box, ~150KB gzipped |
| Frontend | **React island** in Astro | Globe is interactive; rest of site stays static |
| Real-time | **Server-Sent Events** | One-way, simple, CDN-friendly, native browser support |
| Broadcast | **Cloudflare Durable Object** | Single instance holds connection list, edge fan-out |
| Storage | **Cloudflare D1** | SQL fits this volume, already in stack |
| Geolocation | **Cloudflare's `cf` request properties** (`country`, `city`, `continent`, `latitude`, `longitude`) | No third-party API, no rate limit |
| Animations | **GSAP** for HUD + native three.js timelines for in-globe | Each tool for its strength |
| Type safety | **TypeScript** end-to-end | Same as rest of site |

### 10.1 New dependencies to add

```json
{
  "globe.gl": "^2.x",
  "three": "^0.16x.x",
  "gsap": "^3.x"
}
```

### 10.2 New files

```
src/pages/live.astro                    # the page itself
src/components/LiveGlobe.tsx            # React island, the globe + HUD
src/components/GlobeHUD.tsx             # frosted-glass panels
src/components/PinAnimation.ts          # ring/dot animation logic
src/lib/tracking.ts                     # client-side new/returning detection
src/lib/eventStream.ts                  # SSE client wrapper
functions/api/track-visit.ts            # Pages Function: log visit
functions/api/track-download.ts         # Pages Function: log download
functions/pdfs/[paper].ts               # Pages Function: track + serve PDF
functions/live/stream.ts                # Pages Function: SSE endpoint
functions/live/events.ts                # Pages Function: history endpoint
functions/live/totals.ts                # Pages Function: since-launch totals
functions/_lib/d1.ts                    # D1 helpers
functions/_lib/broadcast.ts             # Durable Object client
db/migrations/0001_init.sql             # D1 schema
```

### 10.3 Wrangler additions

```toml
[[d1_databases]]
binding = "DB"
database_name = "yarivitzkovich-events"
database_id = "<created via wrangler d1 create>"

[[durable_objects.bindings]]
name = "BROADCAST"
class_name = "BroadcastHub"
script_name = "yarivitzkovich-site"
```

---

## 11. Phased delivery

| Phase | Ships | Effort |
|---|---|---|
| **P0** — data pipeline | D1 created + schema + Pages Functions for visit/download tracking + bot filtering + dedup. **No UI.** Validates data is being captured correctly. | ~3h |
| **P1** — static globe MVP | `/live` page, halftone globe, dots for last 7d (queried at page load, no real-time yet). HUD with totals + top countries. | ~6h |
| **P2** — real-time pulse | Durable Object + SSE stream. 3-class pin animations with correct colors and timings. Page becomes "magical". | ~6h |
| **P3** — filters, polish, mobile | Time/paper filters, click-pin card, mobile layout, `prefers-reduced-motion`, accessibility pass. | ~4h |
| **P4** — bonus (optional) | Sound toggle, shareable filtered URLs, weekly email digest, RSS of downloads. | ~3h |

**Total to "magical":** ~15h (P0–P2)
**Total to "polished and shipped":** ~19h (P0–P3)
**Bonus stretch:** ~22h (P0–P4)

Spread across 3–4 focused build sessions.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Looks like every "globe demo" | Halftone earth + restrained brand-only palette + glass HUD differentiates |
| Bots inflate numbers | UA filter + CF bot score + ip-hash dedup + visible "bots filtered" footnote |
| Almost no real downloads → looks empty | Default 30d window if data is sparse; show "since launch" total prominently to give scale |
| WebGL not available | Fallback to flat 2D dotted equirectangular map (same dot style, same colors, no rotation) |
| Mobile performance | 30fps cap, 40% fewer dots, no breathing scale |
| SSE drops on flaky networks | Auto-reconnect with backoff + Last-Event-ID replay |
| Viral paper → 10k events/day | Aggregate to "heat map mode" if events/sec exceeds threshold |
| Feature doesn't earn its keep | `site.display.liveGlobe = false` hides the entire page + nav links in one line. All backend stays in place but inert (no visitor cost). |

---

## 13. Removability

The whole feature is gated by:

```ts
// src/data/site.ts
display: {
  liveGlobe: true,   // set false to hide the page + all entry points
}
```

Setting to `false`:
- Hides the `/live` page (returns 404 or redirect).
- Removes the `LIVE` nav link.
- Removes the `· LIVE` footer link.
- Tracking continues silently (cheap, useful for later analytics) — or set a separate `display.liveTracking = false` to also kill tracking.

If decommissioned permanently: drop the D1 database and remove the `functions/` files. About 5 minutes of cleanup.

---

## 14. Implementation handoff

### 14.1 Required environment for the build session

- macOS with `node`, `npm`, `git` available.
- Repo at `~/Code/yarivitzkovich-site/`.
- Cloudflare account credentials (already in use — wrangler config).
- `wrangler login` may be required for D1 creation.

### 14.2 First commands to run (P0 kickoff)

```bash
cd ~/Code/yarivitzkovich-site
npm install globe.gl three gsap
wrangler d1 create yarivitzkovich-events
# → copy database_id into wrangler.toml under [[d1_databases]]
mkdir -p db/migrations
# → write 0001_init.sql per §8.2
wrangler d1 execute yarivitzkovich-events --file=db/migrations/0001_init.sql
```

### 14.3 Check-in cadence

After each phase (P0, P1, P2, P3): show progress on a deploy preview, capture user feedback, decide whether to proceed to next phase.

---

## 15. Open questions (resolved)

All answered above. None blocking.

---

*End of spec.*
