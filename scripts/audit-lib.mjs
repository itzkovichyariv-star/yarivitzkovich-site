// Shared helpers for the yarivitzkovich-site visual audit suite.
//
// Mirrors the family-tasks / practicum-v2 audit-lib pattern (see
// ~/.claude/projects/-Users-yarivitzkovich-Downloads/memory/skill_visual_deploy_audit.md)
// adapted for:
//   • Astro 6 + React + Cloudflare Pages stack
//   • No Supabase (this site is mostly static + a few D1-backed routes)
//   • No auth injection (public site; /manage is owner-gated server-side
//     and intentionally out of scope for the public audit)
//   • Configurable base URL via constructor or PLAYWRIGHT_BASE_URL env
//
// Convention:
//   import { Audit, fetchStatus } from './audit-lib.mjs';
//   const audit = new Audit({ name: 'home' });
//   await audit.setup();
//   audit.observerMark();
//   await audit.page.goto(`${audit.baseUrl}/`);
//   const obs = audit.observerSnapshot();
//   audit.recordCell({ ... });
//   await audit.teardown();

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

export const ROOT = '/Users/yarivitzkovich/Code/yarivitzkovich-site';
export const DEFAULT_PORT = Number(process.env.AUDIT_PORT || 4321);
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${DEFAULT_PORT}`;

// ─── HTTP helper ──────────────────────────────────────────────────────
// Plain status probe — used by the nav cell to check every link returns
// 200 without booting a full browser context per link.
export async function fetchStatus(url, { redirect = 'follow' } = {}) {
  try {
    const r = await fetch(url, { redirect, method: 'GET' });
    return { ok: r.ok, status: r.status, finalUrl: r.url };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// ─── The Audit class ─────────────────────────────────────────────────
export class Audit {
  constructor({ name, baseUrl = BASE_URL, slowMo = 150, viewport = { width: 1400, height: 900 }, noBrowser = false }) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.slowMo = slowMo;
    this.viewport = viewport;
    this.noBrowser = noBrowser;
    this.ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.out = `/tmp/yariv-site-audit-${name}-${this.ts}`;
    this.cells = [];
    this._consoleErrors = [];
    this._pageErrors = [];
    this._netFailures = [];
    this._badResponses = [];
  }

  log(msg) {
    const t = Math.round((Date.now() - this.startMs) / 1000);
    process.stdout.write(`+${String(t).padStart(3, ' ')}s [${this.name}] ${msg}\n`);
  }

  async setup() {
    this.startMs = Date.now();
    mkdirSync(this.out, { recursive: true });
    this.log(`OUT = ${this.out}`);
    this.log(`BASE = ${this.baseUrl}`);

    // Detect substrate by probing /api/me. Cloudflare Pages Functions
    // run under `wrangler pages dev` (200) but not under plain
    // `astro dev` (404). This controls whether we apply dev-only 404
    // filters below. Manual override via AUDIT_SUBSTRATE env.
    const override = process.env.AUDIT_SUBSTRATE;
    if (override === 'wrangler' || override === 'astro' || override === 'prod') {
      this.substrate = override;
    } else {
      try {
        const r = await fetch(`${this.baseUrl}/api/me`, { signal: AbortSignal.timeout(3000) });
        this.substrate = r.status === 200 ? 'wrangler' : r.status === 404 ? 'astro' : 'astro';
      } catch {
        this.substrate = 'astro';
      }
    }
    this.log(`SUBSTRATE = ${this.substrate} (Pages Functions ${this.substrate === 'astro' ? 'NOT' : ''} executing)`);

    if (this.noBrowser) {
      this.log('HTTP-only mode (no browser launched)');
      return;
    }
    this.log('Launching headed Chromium...');
    this.browser = await chromium.launch({ headless: false, slowMo: this.slowMo });
    this.ctx = await this.browser.newContext({
      viewport: this.viewport,
      locale: 'en-US',
      timezoneId: 'Asia/Jerusalem',
    });
    this.page = await this.ctx.newPage();

    // Universal error observers. Console/page errors / network failures
    // captured between observerMark() and observerSnapshot() are
    // attributed to whichever cell called them.
    this.page.on('console', (m) => {
      if (m.type() === 'error') {
        const text = m.text();
        // Filter known-noisy messages.
        if (/favicon\.ico/.test(text)) return;
        if (/\.map\b/.test(text)) return;
        if (/Hydration completed but contains mismatches/.test(text)) return;
        if (/A tree hydrated but/.test(text)) return; // React hydration warning
        // Dev-server HMR / dev-toolbar chatter
        if (/\[vite\] connect/.test(text)) return;
        // The generic "Failed to load resource" message duplicates info
        // we already capture as a structured badResponses entry (with
        // URL + status). Drop it here so failures aren't double-counted.
        if (/Failed to load resource: the server responded with a status of/.test(text)) return;
        this._consoleErrors.push(text);
      }
    });
    this.page.on('pageerror', (e) => this._pageErrors.push(String(e)));
    this.page.on('requestfailed', (req) => {
      const url = req.url();
      if (/favicon\.ico|\.map$/.test(url)) return;
      // Owner-only `/api/me` returns 401 for non-owner visitors during
      // dev — that's expected behavior, not a failure to flag.
      if (/\/api\/me\b/.test(url)) return;
      this._netFailures.push(`${req.method()} ${url} — ${req.failure()?.errorText || 'failed'}`);
    });
    // HTTP 4xx/5xx responses don't fire `requestfailed` (the request
    // succeeded; the server just returned an error code). Capture them
    // separately so cells can pinpoint the offending URL when a console
    // "Failed to load resource" message fires.
    this.page.on('response', (resp) => {
      const status = resp.status();
      if (status < 400) return;
      const url = resp.url();
      if (/favicon\.ico|\.map$/.test(url)) return;
      // Substrate-aware filtering. Under `astro dev`, Cloudflare Pages
      // Functions don't execute, so /api/* and /live/* 404. That's an
      // environment artifact, not a code bug, so we drop it. Under
      // `wrangler pages dev` (or prod), those routes execute; ANY 4xx
      // or 5xx from them is a real failure and surfaces here.
      if (this.substrate === 'astro') {
        const pathname = new URL(url).pathname;
        if (/^\/(api|live)\//.test(pathname) && status === 404) return;
      }
      // /api/citations?slug=X returns 404 by design when the paper
      // has no cached citation data (citation_cache table empty for
      // that slug). Local D1 starts empty; on prod most papers also
      // don't have a row until the sync job runs. This is documented
      // behavior — see functions/api/citations.js line ~140. A real
      // failure would be a 500 from this endpoint.
      const u = new URL(url);
      if (u.pathname === '/api/citations' && status === 404) return;
      this._badResponses.push(`${status} ${resp.request().method()} ${url}`);
    });
  }

  async teardown() {
    await this.writeReport();
    if (!this.noBrowser) {
      await this.ctx?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
    }
    const pass = this.cells.filter((c) => c.pass === true).length;
    const total = this.cells.length;
    this.log(`Report: ${this.out}/report.html  (${pass}/${total} pass)`);
  }

  observerMark() {
    this._consoleErrors.length = 0;
    this._pageErrors.length = 0;
    this._netFailures.length = 0;
    this._badResponses.length = 0;
  }

  observerSnapshot() {
    return {
      consoleErrors: [...this._consoleErrors],
      pageErrors: [...this._pageErrors],
      netFailures: [...this._netFailures],
      badResponses: [...this._badResponses],
    };
  }

  async shot(name) {
    const p = `${this.out}/${name}.png`;
    await this.page.screenshot({ path: p, fullPage: false }).catch(() => {});
    return p;
  }

  recordCell({ id, tableRef = '', expected, observed, pass, before, after, notes = '' }) {
    this.cells.push({ id, tableRef, expected, observed, pass, before, after, notes });
    const tick = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'SKIP';
    this.log(`  -> ${tick} ${id}: ${observed}`);
  }

  async writeReport() {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>yarivitzkovich-site audit — ${this.name}</title>
<style>
body { font-family: -apple-system, system-ui, sans-serif; padding: 20px; background: #fafafa; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; background: white; }
th, td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; text-align: start; }
th { background: #333; color: white; }
.pass { color: #0a7; font-weight: bold; }
.fail { color: #c33; font-weight: bold; }
.skip { color: #888; }
.cell-id { font-weight: 600; }
img { max-width: 320px; border: 1px solid #ddd; }
pre { white-space: pre-wrap; font-size: 12px; margin: 0; }
</style></head>
<body>
<h1>yarivitzkovich-site audit — ${this.name}</h1>
<p>Generated ${new Date().toISOString()}. Base = ${this.baseUrl}. Pass = expected outcome verified, Fail = mismatch, Skip = couldn't run.</p>
<table>
<thead><tr><th>#</th><th>Cell</th><th>Ref</th><th>Expected</th><th>Observed</th><th>Notes</th><th>Before</th><th>After</th></tr></thead>
<tbody>
${this.cells.map((c, i) => `
<tr>
<td>${i + 1}</td>
<td class="cell-id ${c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'skip'}">${c.id}<br>${c.pass === true ? 'PASS' : c.pass === false ? 'FAIL' : 'SKIP'}</td>
<td>${c.tableRef}</td>
<td><pre>${escapeHtml(c.expected)}</pre></td>
<td><pre>${escapeHtml(c.observed)}</pre></td>
<td><pre>${escapeHtml(c.notes)}</pre></td>
<td>${c.before ? `<img src="${c.before.replace(this.out + '/', '')}"/>` : ''}</td>
<td>${c.after ? `<img src="${c.after.replace(this.out + '/', '')}"/>` : ''}</td>
</tr>
`).join('')}
</tbody></table>
</body></html>`;
    writeFileSync(`${this.out}/report.html`, html);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
