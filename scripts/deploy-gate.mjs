#!/usr/bin/env node
/**
 * deploy-gate.mjs — run every audit cell file under scripts/audit/.
 * Exits 0 only if every cell passes. Use as the MANDATORY check before
 * `npm run build` + `wrangler pages deploy`.
 *
 * Usage:
 *   node scripts/deploy-gate.mjs                    # run everything on default port
 *   node scripts/deploy-gate.mjs --only 01          # one suite by prefix
 *   node scripts/deploy-gate.mjs --skip-build       # skip dev-server probe
 *   node scripts/deploy-gate.mjs --port 4323        # if Astro picked a non-default port
 *   node scripts/deploy-gate.mjs --skip-migrations  # skip the local-D1 preflight
 *
 * On the wrangler substrate (:4324) the gate first runs
 * scripts/check-local-migrations.mjs. A local D1 missing its tables makes
 * /api/citations and /live/* return 500 and turns the browser cells into
 * phantom reds, so that preflight has to pass before any cell is trusted.
 *
 * The dev server must be running BEFORE this script. Start it in another
 * terminal with `npm run dev` and note the port Astro reports.
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/yarivitzkovich/Code/yarivitzkovich-site';
const args = process.argv.slice(2);
const onlyPrefix = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const skipBuildProbe = args.includes('--skip-build');
const skipMigrationCheck = args.includes('--skip-migrations');
const portArg = args.includes('--port') ? args[args.indexOf('--port') + 1] : null;
// Default port preference:
//   1. --port arg                  (explicit override)
//   2. AUDIT_PORT env               (set by caller)
//   3. 4324 if reachable            (wrangler pages dev — preferred substrate)
//   4. 4321                         (astro dev fallback)
const explicitPort = Number(portArg || process.env.AUDIT_PORT || 0);
function probePort(p) {
  try { execSync(`curl -sf -o /dev/null -m 2 http://localhost:${p}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}
const PORT = explicitPort || (probePort(4324) ? 4324 : 4321);
const DEV_URL = `http://localhost:${PORT}`;

// 1. Confirm the dev server is reachable.
if (!skipBuildProbe) {
  if (!probePort(PORT)) {
    console.error(`FAIL dev server NOT reachable at ${DEV_URL}.
   For preferred wrangler mode (full Pages Function fidelity):
     cd ${ROOT} && npm run build
     npx wrangler pages dev dist --port 4324 --local --persist-to /tmp/wrangler-yariv-state
   Or for astro-dev fallback (faster iteration, no Pages Functions):
     cd ${ROOT} && npm run dev
   Then re-run this gate.`);
    process.exit(2);
  }
  console.log(`OK dev server reachable at ${DEV_URL}`);
}

// 1b. Pre-gate: local D1 must have every migration-defined table.
// A missing local table makes /api/citations and /live/* return 500, and the
// browser cells then report phantom reds that read like site bugs (2026-08-12:
// this sat the gate at 10/13 with two of the three reds tracing to it). Only
// meaningful on the wrangler substrate — the astro-dev fallback doesn't run
// Pages Functions, so D1 is never touched there.
if (!skipMigrationCheck && PORT === 4324) {
  console.log('\n──── pre-gate: check-local-migrations ────');
  const mig = spawnSync('node', ['scripts/check-local-migrations.mjs'], { stdio: 'inherit', cwd: ROOT });
  if (mig.status !== 0) {
    console.log('\n  ❌ local D1 is missing migrations — the gate cannot be trusted until this passes.');
    console.log('     (Bypass with --skip-migrations if you know the cells you are running never touch D1.)');
    process.exit(1);
  }
} else if (!skipMigrationCheck) {
  console.log(`\n  (skipping check-local-migrations — substrate is astro-dev on :${PORT}, no Pages Functions/D1)`);
}

// 2. Run each audit file in sequence. Headed browsers compete for focus
//    so we can't parallelize.
const auditDir = join(ROOT, 'scripts/audit');
const files = readdirSync(auditDir).filter((f) => /^\d{2}-.+\.mjs$/.test(f)).sort();
const results = [];

for (const file of files) {
  if (onlyPrefix && !file.startsWith(onlyPrefix)) continue;
  const t0 = Date.now();
  console.log(`\n--- ${file} ---`);
  const proc = spawn('node', [join('scripts/audit', file)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, AUDIT_PORT: String(PORT) },
  });
  const code = await new Promise((res) => proc.on('exit', res));
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ file, code, dur });
  console.log(`--- ${file} -> exit ${code} (${dur}s) ---`);
}

// 3. Summary table + exit code.
console.log('\n========== Deploy Gate Summary ==========');
let anyFailed = false;
for (const r of results) {
  const mark = r.code === 0 ? 'PASS' : 'FAIL';
  console.log(`${mark} ${r.file.padEnd(40)} ${r.dur}s  exit=${r.code}`);
  if (r.code !== 0) anyFailed = true;
}
if (anyFailed) {
  console.error('\nFAIL DEPLOY GATE FAILED - at least one cell did not pass. Do NOT deploy.');
  process.exit(1);
}
console.log('\nPASS DEPLOY GATE PASSED - safe to deploy.');
