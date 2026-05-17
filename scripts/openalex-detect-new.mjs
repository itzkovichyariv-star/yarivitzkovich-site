#!/usr/bin/env node
// Detect-new-publications step of the OpenAlex sync workflow.
//
// Reads:
//   /tmp/openalex-works.json — output of the prior "Fetch all works" curl
//
// Writes:
//   /tmp/new-works.json — array of works whose DOI is not yet anywhere
//     in the repo (neither published in src/content/publications/*.mdx
//     nor still sitting as a draft in src/content/publications/_drafts/*.mdx).
//
// Including the _drafts folder in the existing-DOI set is the whole
// point of having this as a standalone script: the previous inline
// implementation only scanned the top-level folder, so a draft that
// hadn't been published yet would get re-created every Monday until
// the owner moved it out. By checking both folders we make the
// workflow idempotent across weeks.

import fs from 'node:fs';
import path from 'node:path';

const WORKS_PATH = '/tmp/openalex-works.json';
const OUT_PATH = '/tmp/new-works.json';
const PUB_DIR = 'src/content/publications';
const DRAFTS_DIR = path.join(PUB_DIR, '_drafts');

const works = (JSON.parse(fs.readFileSync(WORKS_PATH, 'utf8')).results || []);

// Collect DOIs from every .mdx file in both folders. We grep the YAML
// frontmatter rather than parsing it fully — the existing files mix
// quoted and unquoted DOI values, and a regex covers both. DOIs are
// case-insensitive in practice; we lowercase before comparing.
const doiRegex = /^doi:\s*['"]?(10\.[^\s'"]+)['"]?\s*$/im;

function collectDois(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));
  const out = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = content.match(doiRegex);
    if (m) out.push(m[1].toLowerCase().trim());
  }
  return out;
}

const existing = new Set([
  ...collectDois(PUB_DIR),
  ...collectDois(DRAFTS_DIR),
]);

console.log(`Existing DOIs in repo: ${existing.size} (across publications/ and _drafts/)`);

const newWorks = works.filter((w) => {
  if (!w.doi) return false;
  const doi = String(w.doi).replace('https://doi.org/', '').toLowerCase().trim();
  return !existing.has(doi);
});

if (newWorks.length === 0) {
  console.log('No new publications found.');
} else {
  console.log(`New publications found: ${newWorks.length}`);
  for (const w of newWorks) {
    console.log(`  - ${w.doi}  ${w.title || '(no title)'}`);
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(newWorks, null, 2));
