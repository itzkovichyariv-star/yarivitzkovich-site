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
 *
 * The dev server must be running BEFORE this script. Start it in another
 * terminal with `npm run dev` and note the port Astro reports.
 */
import { execSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/yarivitzkovich/Code/yarivitzkovich-site';
const args = process.argv.slice(2);
const onlyPrefix = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const skipBuildProbe = args.includes('--skip-build');
const portArg = args.includes('--port') ? args[args.indexOf('--port') + 1] : null;
const PORT = Number(portArg || process.env.AUDIT_PORT || 4321);
const DEV_URL = `http://localhost:${PORT}`;

// 1. Confirm the dev server is reachable.
if (!skipBuildProbe) {
  try {
    execSync(`curl -sf -o /dev/null -m 3 ${DEV_URL}`, { stdio: 'ignore' });
    console.log(`OK dev server reachable at ${DEV_URL}`);
  } catch {
    console.error(`FAIL dev server NOT reachable at ${DEV_URL}.
   Start it first: cd ${ROOT} && npm run dev
   If Astro picked a different port, pass --port <n>.`);
    process.exit(2);
  }
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
