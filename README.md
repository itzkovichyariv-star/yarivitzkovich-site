# yarivitzkovich.com

Personal academic website for Yariv Itzkovich (Ariel University, Associate Editor at the Journal of Managerial Psychology). Built with Astro, Tailwind, and MDX. Also designed to be a reusable template for other researchers.

## Quick start

```bash
npm install
npm run dev
```

Site served at http://localhost:4321.

## Commands

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the dev server                      |
| `npm run build`   | Build the static site into `dist/`        |
| `npm run preview` | Preview the built site locally            |
| `npm run astro`   | Run Astro CLI (e.g. `astro add`)          |

## Project structure

```
src/
├── components/          UI building blocks (Nav, Footer, toggles, etc.)
├── content/             Content files (publications, courses, conferences)
│   └── publications/
│       └── _drafts/     Work-in-progress papers (excluded from build)
├── data/                Site config + taxonomies (topics, methods)
├── layouts/             Page layouts
├── pages/               Astro pages
└── styles/              Global CSS
public/
├── pdfs/                Paper PDFs, CV, syllabi
├── podcasts/            Audio companions (MP3)
└── images/              Cover images, headshot, etc.
```

## Status (Phase 1 complete)

Implemented:
- Astro 5 scaffold with Tailwind v4, React islands, MDX, sitemap
- Design system (cream/burgundy palette; Fraunces / Instrument Sans / JetBrains Mono)
- Dark mode (follows system preference; togglable; persisted in localStorage)
- Hebrew scaffolding (i18n config, RTL-ready layout)
- Home page: hero, Fields of Inquiry, Now, Selected writing, contact footer
- Content collection schemas (publications, courses, conferences)

Next phases (see design doc):
2. Publications index + detail drawer + filters
3. Citations, audio player, timeline + topics views
4. Research, Teaching, Conferences, CV, Editorial pages
5. Hebrew content mirror
6. Analytics (Cloudflare), OpenAlex sync, podcast RSS, Pagefind search
7. Template finalization for other researchers
