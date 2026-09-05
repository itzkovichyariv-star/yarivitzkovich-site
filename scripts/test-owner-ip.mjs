#!/usr/bin/env node
/**
 * Owner-by-IP recognition — the rules, as runnable assertions.
 *
 *   node scripts/test-owner-ip.mjs
 *
 * Two things are checked, and the second is the one that matters:
 *   1. A rotated address on a known network is still the owner.
 *   2. A near-miss network is still a stranger. Widening the match is only
 *      safe while that stays true, so it is asserted rather than assumed.
 *
 * The real OWNER_IPS from wrangler.toml is used, so editing that list runs
 * these checks against what actually ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'functions/_lib/auth.js'), 'utf8');
const slice = src.slice(
  src.indexOf('function ipv6Prefix64'),
  src.indexOf('/** True if the request carries a valid owner cookie')
);
const { ipv6Prefix64, isOwnerByIP } = await import(
  'data:text/javascript,' + encodeURIComponent(slice + '\nexport { ipv6Prefix64, isOwnerByIP };')
);

const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const env = { OWNER_IPS: toml.match(/^OWNER_IPS = "([^"]*)"/m)[1] };
const req = (ip) => ({ headers: { get: (h) => (h === 'cf-connecting-ip' ? ip : null) } });

let failed = 0;
const check = (label, got, want) => {
  if (got === want) return;
  failed++;
  console.error(`FAIL  ${label}  (got ${got}, want ${want})`);
};

// A /64 is read the same however it is written.
check('compressed form', ipv6Prefix64('2a00:a041:e654:1c00::1'), ipv6Prefix64('2a00:a041:e654:1c00:0:0:0:1'));
check('leading zeros', ipv6Prefix64('2a00:a041:e654:1c00:00f6::'), ipv6Prefix64('2a00:a041:e654:1c00:f6::'));
check('prefix notation', ipv6Prefix64('2a00:a041:e654:1c00::/64'), ipv6Prefix64('2a00:a041:e654:1c00:f6:6639:c2b0:ee75'));
check('ipv4 is not ipv6', ipv6Prefix64('192.114.52.9'), null);

// Every network in the list recognises an address that rotated on it.
for (const entry of env.OWNER_IPS.split(',').filter((e) => e.includes(':'))) {
  const rotated = entry.trim().split('/')[0].replace(/::.*$/, '::').concat('dead:beef:1234:5678');
  check(`rotated address on ${entry.trim()}`, isOwnerByIP(req(rotated), env), true);
}

// Fixed addresses still match exactly.
for (const entry of env.OWNER_IPS.split(',').filter((e) => !e.includes(':'))) {
  check(`exact ${entry.trim()}`, isOwnerByIP(req(entry.trim()), env), true);
}

// And these must never be the owner.
for (const stranger of [
  '2a00:a041:e654:1c01::1',      // one hextet off a known /64
  '2a00:a041:e62b:c601::9',
  '2a02:6680:1104:1822::1',
  '2001:4860:4860::8888',
  '8.8.8.8',
  '192.114.52.10',               // next door to a listed IPv4
  '5.29.18.42',
]) {
  check(`stranger ${stranger}`, isOwnerByIP(req(stranger), env), false);
}

check('no cf-connecting-ip', isOwnerByIP(req(null), env), false);
check('OWNER_IPS unset', isOwnerByIP(req('2a00:a041:e654:1c00::1'), {}), false);

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('✓ owner-by-IP: rotated addresses on known networks are recognised, near-miss networks are not.');
