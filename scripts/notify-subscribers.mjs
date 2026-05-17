#!/usr/bin/env node
// For each comma-separated slug in env.SLUGS, read the corresponding
// MDX file in src/content/publications/, extract title + tldr + venue
// + year from the YAML frontmatter, and POST to /api/notify-new-paper.
//
// The endpoint is idempotent: re-running the workflow for the same
// slug is a no-op after the first successful send.

import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://yarivitzkovich.org';
const PUB_DIR = 'src/content/publications';

const slugs = (process.env.SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean);
const token = process.env.QC_SECRET;

if (!token) {
  console.error('QC_SECRET is not set.');
  process.exit(1);
}

if (slugs.length === 0) {
  console.log('No slugs to notify about.');
  process.exit(0);
}

for (const slug of slugs) {
  const filePath = path.join(PUB_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping ${slug}: file not found at ${filePath}`);
    continue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = extractFrontmatter(raw);
  const meta = parseYamlScalars(frontmatter);

  // Don't notify if the publication is in a non-published status —
  // working papers and drafts shouldn't trigger an email.
  const status = (meta.status || '').toLowerCase();
  if (status && status !== 'published' && status !== 'in-press') {
    console.log(`Skipping ${slug}: status="${status}"`);
    continue;
  }

  const payload = {
    paper_slug: slug,
    paper_title: meta.title || slug,
    tldr: meta.tldr || '',
    venue: meta.venue || '',
    year: meta.year || '',
  };

  console.log(`Notifying for: ${slug} — ${payload.paper_title}`);

  const res = await fetch(`${SITE}/api/notify-new-paper`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-qc-token': token,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  if (!res.ok) {
    console.error(`Notification failed for ${slug}`);
    process.exitCode = 1;
  }
}

function extractFrontmatter(mdx) {
  const m = mdx.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

// Tiny scalar-only YAML reader. The publications schema's frontmatter
// has nested arrays and objects (authors, topics), but for the fields
// we need here (title, tldr, venue, year, status) the values are
// always top-level scalars, so this minimal parser is enough.
function parseYamlScalars(yaml) {
  const out = {};
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip indented continuation lines from arrays/objects
    if (/^\s/.test(line)) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (!val) {
      // Look-ahead for a block scalar (| or >) on a multiline value
      const next = lines[i + 1] || '';
      if (next.startsWith('  ')) {
        // collect indented lines as the value
        const collected = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('  ')) {
            collected.push(lines[j].replace(/^ {2}/, ''));
          } else {
            break;
          }
        }
        val = collected.join(' ').trim();
        i += collected.length;
      }
    }
    if (val.startsWith('|') || val.startsWith('>')) {
      const collected = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('  ')) {
          collected.push(lines[j].replace(/^ {2}/, ''));
        } else {
          break;
        }
      }
      val = collected.join(' ').trim();
      i += collected.length;
    }
    // Strip surrounding quotes
    val = val.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
    out[key] = val;
  }
  return out;
}
