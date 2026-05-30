#!/usr/bin/env node
/**
 * gen-paper-titles.mjs — build a { slug: curatedTitle } map from the
 * publication .mdx frontmatter, written to src/data/paper-titles.json.
 *
 * Why: the Live globe's BreakdownDrawer is a client island and cannot read
 * astro:content at runtime. Without this map it falls back to
 * slug.replace(/-/g,' ') — which renders titles in lowercase ("coworkers
 * solidarity deviant behavior"). Importing this generated map lets the drawer
 * show the real, properly-capitalized titles.
 *
 * Runs as the first step of `npm run build` so it can never drift from the
 * .mdx titles. Top-level files only (mirrors the content collection's
 * non-recursive glob; _drafts/ are excluded).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'src/content/publications');
const OUT = path.join(process.cwd(), 'src/data/paper-titles.json');

const map = {};
for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.mdx')) continue; // skip _drafts/ (a subdir) + non-mdx
  const src = readFileSync(path.join(DIR, file), 'utf8');
  const fm = src.split('---')[1] || '';
  const slug = (fm.match(/^slug:\s*(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const title = (fm.match(/^title:\s*(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  if (slug && title) map[slug] = title;
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
console.log(`✓ wrote ${path.relative(process.cwd(), OUT)} (${Object.keys(sorted).length} titles)`);
