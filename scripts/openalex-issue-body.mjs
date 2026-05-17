#!/usr/bin/env node
// Prints the GitHub Issue body to stdout for new OpenAlex publications.
// Reads /tmp/new-works.json. If there are no new works, exits silently
// with no output so the workflow can skip creating an issue.

import fs from 'node:fs';

const newWorks = JSON.parse(fs.readFileSync('/tmp/new-works.json', 'utf8'));
if (newWorks.length === 0) process.exit(0);

const lines = newWorks.map((w) => {
  const doi = String(w.doi || '').replace('https://doi.org/', '');
  return `- **${w.title}** (${w.publication_year}) — DOI: \`${doi}\``;
});

const body = [
  '## New publications detected via OpenAlex',
  '',
  'The following papers were found on OpenAlex but are not yet on the site:',
  '',
  ...lines,
  '',
  '**What to do:**',
  '',
  '1. Find the draft MDX file in `src/content/publications/_drafts/`',
  '2. Add `topics`, `methods`, `tldr`, and `abstract`',
  '3. Move it to `src/content/publications/`',
  '4. Commit and push — the site rebuilds automatically',
  '',
].join('\n');

process.stdout.write(body);
