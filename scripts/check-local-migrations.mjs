#!/usr/bin/env node
/**
 * Local-D1 migration preflight.
 *
 * WHY THIS EXISTS (2026-08-12): the deploy gate sat at 10/13 with three reds
 * that looked like product bugs and were not. Two of them —
 * `06-publication-detail` and `02-static-pages`→/live — were ONE cause: the
 * local D1 at the wrangler persist path had never been migrated, so
 * `/api/citations` 500'd with `no such table: citation_cache` and
 * `/live/totals` + `/live/events` 500'd the same way. Production was fine
 * throughout (`/api/citations` returns 200 `{citation_count:28}`). The gate
 * was reporting harness failures as if they were site failures, which is
 * worse than no gate: it trains you to wave reds through.
 *
 * This preflight makes that class of failure impossible to ship past again:
 * it replays every `CREATE TABLE` in db/migrations/*.sql and asserts each
 * resulting table exists in the local D1. Missing any ⇒ exit non-zero with
 * the exact one-line fix. Pass `--fix` to apply the migrations directly.
 *
 * IMPORTANT — the persist path. This repo does NOT use wrangler's default
 * `.wrangler/state`. The gate's substrate is started with
 * `--persist-to /tmp/wrangler-yariv-state`, so every `wrangler d1` call here
 * MUST pass the same flag or it inspects a DIFFERENT, empty database and
 * reports a cheerful green while the server the cells actually hit is still
 * missing its tables. Override with WRANGLER_PERSIST_TO if that path moves.
 *
 * Runs as the FIRST step of deploy-gate.mjs — before any browser suite — so a
 * missing migration fails fast and loud instead of producing phantom reds.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const migDir = resolve(root, 'db/migrations');
const DB = 'yarivitzkovich-events';
const PERSIST = process.env.WRANGLER_PERSIST_TO || '/tmp/wrangler-yariv-state';
const fix = process.argv.includes('--fix');

// Compute the FINAL expected schema by replaying every migration in order,
// tracking CREATE / DROP / RENAME. A naive "every CREATE TABLE must exist"
// check false-flags any table a migration creates and then renames away
// within the same file, so order matters.
const expected = new Map(); // table -> file that last created it
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  // Strip `--` line comments BEFORE matching: a comment containing the words
  // "CREATE TABLE" would otherwise be read as a real statement and invent a
  // phantom table name that can never exist (this bit family-tasks live on
  // 2026-07-04). Only code lines can define or drop a table.
  const sql = readFileSync(resolve(migDir, f), 'utf8').replace(/--.*$/gm, '');
  const stmtRe = /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)|ALTER\s+TABLE\s+["`']?([a-zA-Z0-9_]+)["`']?\s+RENAME\s+TO\s+["`']?([a-zA-Z0-9_]+))/gi;
  let m;
  while ((m = stmtRe.exec(sql)) !== null) {
    if (m[2]) expected.set(m[2], f);          // CREATE TABLE <m2>
    else if (m[3]) expected.delete(m[3]);     // DROP TABLE <m3>
    else if (m[4] && m[5]) {                  // ALTER <m4> RENAME TO <m5>
      expected.delete(m[4]);
      expected.set(m[5], f);
    }
  }
}

const FIX_CMD = `npx wrangler d1 migrations apply ${DB} --local --persist-to ${PERSIST}`;

// Read the tables the local D1 actually has, at the SAME persist path the
// gate's substrate uses.
function localTables() {
  const out = execSync(
    `cd ${root} && npx wrangler d1 execute ${DB} --local --persist-to ${PERSIST} ` +
      `--command "SELECT name FROM sqlite_master WHERE type='table'" --json 2>/dev/null`,
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  // wrangler prints a banner before the JSON array; grab from the first '['.
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return new Set((parsed[0]?.results ?? []).map((r) => r.name));
}

console.log(`  persist path: ${PERSIST}${existsSync(PERSIST) ? '' : '  (does not exist yet)'}`);

let have;
try {
  have = localTables();
} catch (e) {
  console.error(`  ❌ could not read the local D1 at ${PERSIST}.`);
  console.error('     Start the substrate once so miniflare creates it:');
  console.error(`       npm run build && npx wrangler pages dev dist --port 4324 --local --persist-to ${PERSIST}`);
  console.error('     ' + (e.message || '').slice(0, 200));
  process.exit(1);
}

const missing = [...expected.entries()].filter(([t]) => !have.has(t));

if (missing.length === 0) {
  console.log(`  ✅ local D1 has all ${expected.size} migration-defined tables.`);
  process.exit(0);
}

console.log(`  ❌ local D1 is MISSING ${missing.length} migration-defined table(s):`);
for (const [t, f] of missing) console.log(`       - ${t}  (from ${f})`);

if (!fix) {
  console.log('\n  This is the 2026-08-12 root cause: missing local tables make /api/citations');
  console.log('  and /live/* return 500, and the browser cells then report phantom reds that');
  console.log('  look like site bugs. Production is unaffected — this is local state only.');
  console.log('\n  Fix, then restart the substrate so miniflare re-opens the DB:');
  console.log(`    ${FIX_CMD}`);
  console.log('\n  Or apply automatically:  node scripts/check-local-migrations.mjs --fix');
  process.exit(1);
}

console.log('\n  --fix: applying migrations to the local D1…');
execSync(`cd ${root} && ${FIX_CMD}`, { stdio: 'inherit' });
console.log('\n  ✅ applied. Restart the wrangler substrate, then re-run the gate.');
process.exit(0);
