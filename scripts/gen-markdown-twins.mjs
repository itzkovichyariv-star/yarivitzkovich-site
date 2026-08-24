#!/usr/bin/env node
/**
 * gen-markdown-twins.mjs — emit a Markdown representation of every built
 * HTML page, next to it in `dist/`.
 *
 * Why derive from the built HTML instead of hand-writing Markdown:
 * a hand-written twin is a second copy of the content, and second copies
 * drift. Reading the page Astro just rendered means the Markdown is, by
 * construction, exactly what the page says — including content that lives
 * in .astro templates rather than in a data file.
 *
 * Route → twin mapping (what functions/_middleware.js looks for):
 *   dist/index.html             → dist/index.md          (serves "/")
 *   dist/about/index.html       → dist/about.md          (serves "/about")
 *   dist/publications/x/index.html → dist/publications/x.md
 *   dist/404.html               → dist/404.md            (the agent 404 body)
 *
 * Only <main> and the #contact footer are converted. Nav, the search
 * overlay and the build-version chip are chrome, not content, and would
 * be repeated noise at the top of all 80-odd files.
 *
 * Run after `astro build` (see the `build` script in package.json).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import TurndownService from 'turndown';

const DIST = join(process.cwd(), 'dist');
const SITE = 'https://yarivitzkovich.org';

// Directories whose HTML is not public content:
//   manage/  — owner-only console, already Disallow'd in robots.txt
//   pagefind/— search index internals, not pages
const SKIP_DIRS = new Set(['manage', 'pagefind', '_astro']);

// Individual routes that are public HTML but shouldn't gain a second
// public representation. These are the same routes robots.txt disallows
// and astro.config.mjs keeps out of the sitemap; giving them a .md twin
// would quietly re-expose what those two files deliberately withhold.
const SKIP_ROUTES = new Set(['/subscribe-confirm']);

// ─── Turndown setup ───────────────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
});

// Chrome and decoration that carries no information once the styling is
// gone. `svg` matters most: every arrow, icon and the contact QR would
// otherwise land in the output as a wall of path coordinates.
turndown.remove(['script', 'style', 'svg', 'noscript', 'form', 'input', 'button']);

// An <audio> element is a real resource for an agent (the podcast
// companion for a paper), so surface its src as a link rather than
// dropping the element and losing the URL entirely.
turndown.addRule('audio', {
  filter: 'audio',
  replacement: (_content, node) => {
    const src = node.getAttribute('src');
    return src ? `\n\n[Audio](${src})\n\n` : '';
  },
});

/** Recursively collect every .html file under `dir`. */
function collectHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      collectHtml(full, out);
    } else if (name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Map a built HTML file to { route, twinPath }.
 * Returns null for files that shouldn't get a twin.
 */
function routeFor(htmlPath) {
  const rel = relative(DIST, htmlPath).split(sep).join('/');
  if (rel === 'index.html') return { route: '/', twin: join(DIST, 'index.md') };
  if (rel === '404.html') return { route: '/404', twin: join(DIST, '404.md') };
  if (rel.endsWith('/index.html')) {
    const route = '/' + rel.slice(0, -'/index.html'.length);
    return { route, twin: join(DIST, route.slice(1) + '.md') };
  }
  // A bare foo.html (Astro emits these only with build.format:'file').
  const route = '/' + rel.slice(0, -'.html'.length);
  return { route, twin: join(DIST, route.slice(1) + '.md') };
}

/** Pull one element's outer HTML out of a document string. */
function extract(html, openTagRe, closeTag) {
  const start = html.search(openTagRe);
  if (start === -1) return '';
  const end = html.indexOf(closeTag, start);
  if (end === -1) return '';
  return html.slice(start, end + closeTag.length);
}

function metaContent(html, name) {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Rewrite root-relative link and image targets to absolute URLs. An agent
 * that fetched /about.md has no base URL to resolve "/publications"
 * against, so relative targets there are dead ends.
 */
function absolutize(md) {
  return md.replace(/\]\((\/[^)\s]*)\)/g, (_m, path) => `](${SITE}${path})`);
}

function toMarkdown(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const mapped = routeFor(htmlPath);
  if (!mapped || SKIP_ROUTES.has(mapped.route)) return null;

  const main = extract(html, /<main\b[^>]*>/i, '</main>');
  const footer = extract(html, /<footer\b[^>]*id="contact"[^>]*>/i, '</footer>');
  if (!main) return null;

  const body = turndown.turndown(main).trim();
  const contact = footer ? turndown.turndown(footer).trim() : '';
  const description = metaContent(html, 'description');
  const canonical = `${SITE}${mapped.route === '/' ? '/' : mapped.route}`;

  const parts = [];
  if (body) parts.push(body);
  if (contact) parts.push('---', contact);
  parts.push(
    '---',
    [
      `Source: ${canonical}`,
      description ? `Description: ${description}` : null,
      `Site guide for agents: ${SITE}/llms.txt`,
      `All pages on this site are available as Markdown: send \`Accept: text/markdown\`, or append \`.md\` to the path.`,
    ]
      .filter(Boolean)
      .join('\n')
  );

  return { ...mapped, markdown: absolutize(parts.join('\n\n')) + '\n' };
}

// ─── Run ──────────────────────────────────────────────────────────────
const files = collectHtml(DIST);
let written = 0;
let skipped = 0;

for (const file of files) {
  const result = toMarkdown(file);
  if (!result) {
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(result.twin), { recursive: true });
  writeFileSync(result.twin, result.markdown, 'utf8');
  written += 1;
}

console.log(`markdown twins: wrote ${written}, skipped ${skipped} (excluded or no <main>) of ${files.length} HTML files`);

// A twin for "/" is what the acceptmarkdown check probes first. If it is
// missing the negotiation layer silently falls back to HTML everywhere,
// so fail the build loudly rather than shipping a half-working feature.
try {
  statSync(join(DIST, 'index.md'));
} catch {
  console.error('FAIL no dist/index.md produced — the homepage has no Markdown twin.');
  process.exit(1);
}
