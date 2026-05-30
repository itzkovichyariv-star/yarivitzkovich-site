#!/usr/bin/env node
/**
 * sync-bibtex-titles.mjs — make each stored BibTeX `title = {...}` match the
 * frontmatter `title:` (the authoritative, APA 7 sentence-case value).
 *
 * Some .mdx carry a hand-written `bibtex` block whose title was left in the old
 * Title Case after the 2026-05 sentence-case normalization, so the on-page
 * "copy BibTeX" exported a title that disagreed with the displayed one. This
 * syncs them. Idempotent: only writes when they differ. No title contains
 * BibTeX-special chars (& % _ # {}) so direct insertion is safe.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'src/content/publications');
let changed = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.mdx')) continue;
  const p = path.join(DIR, file);
  const src = readFileSync(p, 'utf8');

  const fm = src.split('---')[1] || '';
  const fmTitle = (fm.match(/^title:\s*(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  if (!fmTitle) continue;

  // BibTeX title line: `  title   = {....},`  (uses '=', vs frontmatter ':')
  const bibRe = /^(\s*title\s*=\s*\{)(.*?)(\},?\s*)$/m;
  const m = src.match(bibRe);
  if (!m) continue;                 // no stored bibtex
  if (m[2] === fmTitle) continue;   // already in sync

  const next = src.replace(bibRe, `$1${fmTitle}$3`);
  writeFileSync(p, next, 'utf8');
  console.log(`✓ ${file}`);
  console.log(`    bibtex old: ${m[2]}`);
  console.log(`    bibtex new: ${fmTitle}`);
  changed++;
}
console.log(`\n${changed} bibtex titles synced.`);
